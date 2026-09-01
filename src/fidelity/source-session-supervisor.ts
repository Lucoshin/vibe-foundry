import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createSafeProcessEnvironment } from "../utils/process-environment.js";

function loopbackUrl(value) {
  if (!value) throw new TypeError("sourceUrl is required.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("sourceUrl must be a loopback HTTP URL.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "http:" || !new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
    throw new TypeError("sourceUrl must be a loopback HTTP URL.");
  }
  if (url.username || url.password) {
    throw new TypeError("sourceUrl must not contain credentials.");
  }
  return url.toString();
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function packageManagerFor(projectRoot, packageJson) {
  const declared = String(packageJson.packageManager ?? "").split("@")[0];
  if (declared) {
    if (!new Set(["npm", "pnpm", "yarn"]).has(declared)) {
      throw new Error(`Unsupported source package manager: ${declared}`);
    }
    return declared;
  }
  const detected = [];
  for (const [fileName, manager] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ]) {
    if (await fileExists(join(projectRoot, fileName))) detected.push(manager);
  }
  if (detected.length !== 1) {
    throw new Error("Source package manager is ambiguous; declare packageManager or keep one lockfile.");
  }
  return detected[0];
}

function sourceProcessSpec(manager, sourceScript, platform = process.platform) {
  if (!new Set(["npm", "pnpm", "yarn"]).has(manager)) {
    throw new TypeError(`Unsupported source package manager: ${manager}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(String(sourceScript ?? ""))) {
    throw new TypeError("Source package script name must contain only safe characters.");
  }
  if (platform === "win32") {
    return {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", `${manager}.cmd run ${sourceScript}`],
    };
  }
  return {
    executable: manager,
    args: ["run", sourceScript],
  };
}

function boundedText(limit) {
  let content = Buffer.alloc(0);
  return {
    append(chunk) {
      content = Buffer.concat([content, Buffer.from(chunk)]);
      if (content.length > limit) content = content.subarray(content.length - limit);
    },
    text() {
      return content.toString("utf8");
    },
  };
}

function waitForExit(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
}

async function taskkill(pid) {
  const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
    shell: false,
  });
  await waitForExit(killer);
}

const defaultProcessAdapter = {
  async spawn(spec) {
    const stdout = boundedText(spec.outputLimitBytes);
    const stderr = boundedText(spec.outputLimitBytes);
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => stdout.append(chunk));
    child.stderr.on("data", (chunk) => stderr.append(chunk));
    const exited = waitForExit(child);
    let terminated = false;
    return {
      exited,
      diagnostics() {
        return { stdout: stdout.text(), stderr: stderr.text() };
      },
      async terminate() {
        if (terminated || child.exitCode !== null) return;
        terminated = true;
        if (process.platform === "win32") {
          await taskkill(child.pid);
          return;
        }
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      },
    };
  },
};

const defaultHttpAdapter = {
  async waitUntilReady(url, options) {
    const deadline = Date.now() + options.timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
        if (response.status >= 200 && response.status < 400) return;
        lastError = new Error(`Source readiness returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`Source startup timed out for ${url}`, { cause: lastError });
  },
};

export async function openSourceSession(projectRoot, options = {}) {
  const root = resolve(projectRoot);
  const url = loopbackUrl(options.sourceUrl);
  const processAdapter = options.processAdapter ?? defaultProcessAdapter;
  const httpAdapter = options.httpAdapter ?? defaultHttpAdapter;
  const startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
  let ownedProcess = null;

  if (options.sourceScript) {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (!Object.prototype.hasOwnProperty.call(packageJson.scripts ?? {}, options.sourceScript)) {
      throw new Error(`Source package script not found: ${options.sourceScript}`);
    }
    const manager = await packageManagerFor(root, packageJson);
    const processSpec = sourceProcessSpec(manager, options.sourceScript);
    ownedProcess = await processAdapter.spawn({
      ...processSpec,
      cwd: root,
      env: createSafeProcessEnvironment(options.hostEnvironment, { BROWSER: "none" }),
      outputLimitBytes: 16_384,
      shell: false,
    });
  }

  try {
    const ready = httpAdapter.waitUntilReady(url, { timeoutMs: startupTimeoutMs });
    if (ownedProcess?.exited) {
      await Promise.race([
        ready,
        ownedProcess.exited.then(({ code, signal }) => {
          throw new Error(`Source process exited before readiness: code=${code} signal=${signal}`);
        }),
      ]);
    } else {
      await ready;
    }
  } catch (error) {
    await ownedProcess?.terminate();
    throw error;
  }

  let closed = false;
  return {
    url,
    startedProcess: Boolean(ownedProcess),
    diagnostics() {
      return ownedProcess?.diagnostics() ?? { stdout: "", stderr: "" };
    },
    async close() {
      if (closed) return;
      closed = true;
      await ownedProcess?.terminate();
    },
  };
}
