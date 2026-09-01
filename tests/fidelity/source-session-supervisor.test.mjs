import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { openSourceSession } from "../../dist/fidelity/source-session-supervisor.js";

const roots = [];

async function createProject(packageJson, lockfile = "package-lock.json") {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-source-session-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
  if (lockfile) await writeFile(join(root, lockfile), "lock");
  return root;
}

async function findAvailableLoopbackPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
  return address.port;
}

function adapters(options = {}) {
  const calls = { spawn: [], ready: [], terminate: 0 };
  const processAdapter = {
    async spawn(spec) {
      calls.spawn.push(spec);
      return {
        diagnostics() {
          return { stdout: "ready", stderr: "" };
        },
        async terminate() {
          calls.terminate += 1;
        },
      };
    },
  };
  const httpAdapter = {
    async waitUntilReady(url, waitOptions) {
      calls.ready.push({ url, waitOptions });
      if (options.readyError) throw options.readyError;
    },
  };
  return { calls, processAdapter, httpAdapter };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 50,
  })));
});

describe("openSourceSession", () => {
  it("starts the exact package script without shell composition or guessed arguments", async () => {
    const root = await createProject({ scripts: { "dev:h5": "uni" } }, "pnpm-lock.yaml");
    const fake = adapters();

    const session = await openSourceSession(root, {
      sourceScript: "dev:h5",
      sourceUrl: "http://127.0.0.1:5173",
      startupTimeoutMs: 8_000,
      hostEnvironment: {},
      processAdapter: fake.processAdapter,
      httpAdapter: fake.httpAdapter,
    });

    const command = process.platform === "win32"
      ? {
          executable: "cmd.exe",
          args: ["/d", "/s", "/c", "pnpm.cmd run dev:h5"],
        }
      : {
          executable: "pnpm",
          args: ["run", "dev:h5"],
        };
    assert.deepEqual(fake.calls.spawn, [{
      ...command,
      cwd: root,
      env: { BROWSER: "none" },
      outputLimitBytes: 16_384,
      shell: false,
    }]);
    assert.equal(fake.calls.ready[0].url, "http://127.0.0.1:5173/");
    assert.equal(session.startedProcess, true);
    await session.close();
    await session.close();
    assert.equal(fake.calls.terminate, 1);
  });

  it("passes only a safe host environment to the source process adapter", async () => {
    const root = await createProject({ scripts: { dev: "vite" } });
    const fake = adapters();

    const session = await openSourceSession(root, {
      sourceScript: "dev",
      sourceUrl: "http://127.0.0.1:5173",
      hostEnvironment: {
        Path: "C:\\Tools",
        SystemRoot: "C:\\Windows",
        TEMP: "C:\\Temp",
        CUSTOM_PROJECT_SETTING: "must-not-leak",
        VITE_PRIVATE_TOKEN: "vite-secret",
        NPM_TOKEN: "npm-secret",
      },
      processAdapter: fake.processAdapter,
      httpAdapter: fake.httpAdapter,
    });

    assert.deepEqual(fake.calls.spawn[0].env, {
      PATH: "C:\\Tools",
      SYSTEMROOT: "C:\\Windows",
      TEMP: "C:\\Temp",
      BROWSER: "none",
    });
    await session.close();
  });

  it("rejects source script names containing shell metacharacters", async () => {
    const root = await createProject({ scripts: { "dev&whoami": "vite" } });
    const fake = adapters();

    await assert.rejects(
      openSourceSession(root, {
        sourceScript: "dev&whoami",
        sourceUrl: "http://127.0.0.1:5173",
        processAdapter: fake.processAdapter,
        httpAdapter: fake.httpAdapter,
      }),
      /safe characters/,
    );
    assert.equal(fake.calls.spawn.length, 0);
  });

  it("starts an owned npm source server with a sanitized environment", async () => {
    const port = await findAvailableLoopbackPort();
    const sourceUrl = `http://127.0.0.1:${port}`;
    const root = await createProject({
      packageManager: "npm@11.6.2",
      scripts: { "serve:test": "node source-server.mjs" },
    });
    const observationPath = join(root, "observed-environment.json");
    await writeFile(
      join(root, "source-server.mjs"),
      [
        'import { writeFileSync } from "node:fs";',
        'import { createServer } from "node:http";',
        `writeFileSync(${JSON.stringify(observationPath)}, JSON.stringify(process.env));`,
        'const server = createServer((request, response) => {',
        '  if (request.url === "/shutdown") {',
        "    response.statusCode = 204;",
        "    response.end(() => process.exit(0));",
        "    return;",
        "  }",
        "  response.statusCode = 204;",
        "  response.end();",
        "});",
        `server.listen(${port}, "127.0.0.1");`,
      ].join("\n"),
    );
    const forbiddenEnvironment = {
      VIBE_FOUNDRY_TEST_SECRET: "source-secret-sentinel",
      VITE_PRIVATE_TOKEN: "vite-secret-sentinel",
      NPM_TOKEN: "npm-token-sentinel",
    };
    const previousEnvironment = Object.fromEntries(
      Object.keys(forbiddenEnvironment).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, forbiddenEnvironment);
    let session;

    try {
      session = await openSourceSession(root, {
        sourceScript: "serve:test",
        sourceUrl,
        startupTimeoutMs: 15_000,
        hostEnvironment: {
          ...process.env,
          HOME: root,
          USERPROFILE: root,
          APPDATA: root,
          LOCALAPPDATA: root,
          TEMP: root,
          TMP: root,
          ...forbiddenEnvironment,
        },
      });

      const observed = JSON.parse(await readFile(observationPath, "utf8"));
      for (const name of Object.keys(forbiddenEnvironment)) {
        assert.equal(observed[name], undefined);
      }
      assert.equal(observed.BROWSER, "none");
      assert.ok(observed.PATH || observed.Path);
    } finally {
      if (session) {
        try {
          await fetch(`${sourceUrl}/shutdown`, { signal: AbortSignal.timeout(2_000) });
        } finally {
          await session.close();
        }
      }
      for (const [name, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("connects to an existing loopback service without starting a process", async () => {
    const root = await createProject({ scripts: {} });
    const fake = adapters();

    const session = await openSourceSession(root, {
      sourceUrl: "http://localhost:3000/public",
      processAdapter: fake.processAdapter,
      httpAdapter: fake.httpAdapter,
    });

    assert.equal(fake.calls.spawn.length, 0);
    assert.equal(session.startedProcess, false);
    assert.equal(session.url, "http://localhost:3000/public");
    await session.close();
    assert.equal(fake.calls.terminate, 0);
  });

  it("rejects external URLs, missing scripts, and script launch without an expected URL", async () => {
    const root = await createProject({ scripts: { dev: "vite" } });
    const fake = adapters();

    await assert.rejects(
      openSourceSession(root, {
        sourceUrl: "https://example.com",
        processAdapter: fake.processAdapter,
        httpAdapter: fake.httpAdapter,
      }),
      /loopback HTTP URL/,
    );
    await assert.rejects(
      openSourceSession(root, {
        sourceUrl: "http://127.0.0.1:5173",
        sourceScript: "preview",
        processAdapter: fake.processAdapter,
        httpAdapter: fake.httpAdapter,
      }),
      /Source package script not found: preview/,
    );
    await assert.rejects(
      openSourceSession(root, {
        sourceScript: "dev",
        processAdapter: fake.processAdapter,
        httpAdapter: fake.httpAdapter,
      }),
      /sourceUrl is required/,
    );
    assert.equal(fake.calls.spawn.length, 0);
  });

  it("terminates the complete owned process when readiness fails", async () => {
    const root = await createProject({ scripts: { start: "react-scripts start" } });
    const fake = adapters({ readyError: new Error("source startup timed out") });

    await assert.rejects(
      openSourceSession(root, {
        sourceUrl: "http://127.0.0.1:3000",
        sourceScript: "start",
        processAdapter: fake.processAdapter,
        httpAdapter: fake.httpAdapter,
      }),
      /source startup timed out/,
    );
    assert.equal(fake.calls.terminate, 1);
  });
});
