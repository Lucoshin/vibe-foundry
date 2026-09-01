import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

describe("open-source release configuration", () => {
  it("keeps the source repository private to npm and pins the supported toolchain", async () => {
    const packageJson = await readJson("package.json");
    const lockPackage = (await readJson("package-lock.json")).packages[""];

    assert.equal(packageJson.private, true);
    assert.equal(packageJson.engines?.node, "^22.18.0 || >=24.11.0");
    assert.equal(packageJson.packageManager, "npm@11.6.2");
    assert.equal(packageJson.license, "Apache-2.0");
    assert.equal(packageJson.author, "Lucoshin");
    assert.deepEqual(packageJson.repository, {
      type: "git",
      url: "git+https://github.com/Lucoshin/vibe-foundry.git",
    });
    assert.equal(packageJson.homepage, "https://github.com/Lucoshin/vibe-foundry#readme");
    assert.deepEqual(packageJson.bugs, {
      url: "https://github.com/Lucoshin/vibe-foundry/issues",
    });
    assert.equal(lockPackage.license, "Apache-2.0");
  });

  it("builds from a checkout path containing spaces, Chinese, and percent characters", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe foundry 构建 %-"));
    try {
      await mkdir(join(root, "scripts"), { recursive: true });
      await mkdir(join(root, "src"), { recursive: true });
      await copyFile("scripts/build.mjs", join(root, "scripts", "build.mjs"));
      await writeFile(join(root, "src", "example.ts"), "export const example = '路径';\n");

      const result = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], {
        cwd: root,
        encoding: "utf8",
      });

      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(
        await readFile(join(root, "dist", "example.js"), "utf8"),
        "export const example = '路径';\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores sensitive local artifacts while preserving the environment example", async () => {
    const patterns = (await readText(".gitignore"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const pattern of [
      ".env",
      ".env.*",
      "!.env.example",
      "test-results/",
      "playwright-report/",
      "*.tgz",
      "*.db",
      "*.sqlite",
      "*.sqlite3",
      "/uni-h5-*.png",
      ".claude/skills/gitnexus*/",
      ".agents/skills/gitnexus*/",
    ]) {
      assert.ok(patterns.includes(pattern), `missing .gitignore pattern: ${pattern}`);
    }

    assert.ok(
      patterns.indexOf("!.env.example") > patterns.indexOf(".env.*"),
      ".env.example must be re-included after the .env.* rule",
    );
  });

  it("limits generated screenshot ignores to the repository root", () => {
    const rootScreenshot = spawnSync(
      "git",
      ["check-ignore", "--no-index", "--quiet", "uni-h5-5174-home.png"],
      { encoding: "utf8" },
    );
    const nestedPublicAsset = spawnSync(
      "git",
      ["check-ignore", "--no-index", "--quiet", "src/assets/uni-h5-logo.png"],
      { encoding: "utf8" },
    );

    assert.equal(rootScreenshot.error, undefined);
    assert.equal(nestedPublicAsset.error, undefined);
    assert.equal(rootScreenshot.status, 0, "root screenshot should be ignored");
    assert.equal(
      nestedPublicAsset.status,
      1,
      "nested public asset should not be ignored",
    );
  });

  it("ships the canonical Apache-2.0 license and project attribution", async () => {
    const license = (await readText("LICENSE")).replaceAll("\r\n", "\n");
    const digest = createHash("sha256").update(license).digest("hex");

    assert.equal(digest, "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30");
    assert.equal((license.match(/^   \d+\. /gm) ?? []).length, 9);
    assert.match(license, /APPENDIX: How to apply the Apache License to your work\./);
    assert.equal(
      (await readText("NOTICE")).replaceAll("\r\n", "\n").trim(),
      "VibeFoundry\nCopyright 2026 Lucoshin",
    );
  });

  it("publishes contributor, security, conduct, and GitHub collaboration entry points", async () => {
    const requiredFiles = [
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/pull_request_template.md",
      ".github/dependabot.yml",
      "docs/reports/open-source-release-checklist.md",
    ];
    const contents = await Promise.all(requiredFiles.map(readText));
    const [contributing, security, conduct, bugReport, featureRequest, issueConfig, pullRequest] = contents;

    assert.match(contributing, /npm ci/);
    assert.match(contributing, /npm test/);
    assert.match(contributing, /Apache-2\.0/);
    assert.match(security, /github\.com\/Lucoshin\/vibe-foundry\/security\/advisories\/new/);
    assert.match(security, /sourceScript/);
    assert.doesNotMatch(security, /--source-script/);
    assert.doesNotMatch(security, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    assert.match(conduct, /行为|conduct/i);
    assert.match(bugReport, /隐私|secret|秘密/i);
    assert.match(featureRequest, /使用场景|use case/i);
    assert.match(issueConfig, /security\/advisories\/new/);
    assert.match(pullRequest, /npm test/);
    assert.match(pullRequest, /隐私|secret|秘密/i);
  });

  it("documents source-only setup, the centralized library, and the execution trust boundary", async () => {
    const readme = await readText("README.md");
    const docsIndex = await readText("docs/README.md");
    const contributing = await readText("CONTRIBUTING.md");
    const masterPlan = await readText("docs/plans/2026-07-08-vibe-foundry-master-implementation.md");
    const security = await readText("SECURITY.md");
    const releaseChecklist = await readText("docs/reports/open-source-release-checklist.md");

    assert.match(readme, /git clone https:\/\/github\.com\/Lucoshin\/vibe-foundry\.git/);
    assert.match(readme, /不发布 npm|未发布到 npm/);
    assert.match(readme, /assetLibraryRoot[\s\S]*VIBE_FOUNDRY_LIBRARY_ROOT[\s\S]*\.vibe-foundry\/library/);
    assert.match(readme, /绝对路径/);
    assert.match(readme, /不要提交|不得提交/);
    assert.match(readme, /sourceScript/);
    assert.match(readme, /当前公开 CLI[^。]*不提供|公开 CLI[^。]*不提供/);
    assert.doesNotMatch(readme, /node dist\/cli\.js calibrate/);
    assert.match(readme, /显式授权|明确授权/);
    assert.match(readme, /任意代码|任意命令/);
    for (const [path, text] of [
      ["README.md", readme],
      ["CONTRIBUTING.md", contributing],
      ["master plan", masterPlan],
    ]) {
      assert.match(text, />=22\.18\.0 <23[^\n]*>=24\.11\.0/u, path);
    }
    for (const [path, text] of [["README.md", readme], ["SECURITY.md", security]]) {
      assert.match(text, /组件预览[^\n]{0,120}可信源码/u, path);
      assert.match(text, /同源[^\n]{0,120}父窗口[^\n]{0,120}(?:其他|其余) API/u, path);
      assert.match(text, /networkPolicy[^\n]{0,120}不是[^\n]{0,40}安全沙箱/u, path);
    }
    assert.match(releaseChecklist, /当前状态：[^\n]*本地验证[^\n]*待[^\n]*本地提交[^\n]*远端/u);
    assert.match(docsIndex, /open-source-release-checklist\.md/);
    assert.doesNotMatch(`${readme}\n${docsIndex}`, /[A-Z]:\\(?:Users|VibeFoundry)\\/i);
  });

  it("publishes project ownership in plugin and marketplace metadata", async () => {
    const manifest = await readJson("plugins/vibe-foundry/.codex-plugin/plugin.json");
    const marketplace = await readJson(".agents/plugins/marketplace.json");

    assert.equal(manifest.author.name, "Lucoshin");
    assert.equal(manifest.author.url, "https://github.com/Lucoshin");
    assert.equal(manifest.license, "Apache-2.0");
    assert.equal(manifest.repository, "https://github.com/Lucoshin/vibe-foundry");
    assert.equal(manifest.homepage, "https://github.com/Lucoshin/vibe-foundry#readme");
    assert.equal(manifest.interface.developerName, "Lucoshin");
    assert.equal(marketplace.name, "vibe-foundry");
    assert.equal(marketplace.interface.displayName, "VibeFoundry");
  });

  it("runs a least-privilege pinned GitHub Actions matrix and dependency updates", async () => {
    const workflow = await readText(".github/workflows/ci.yml");
    const dependabot = await readText(".github/dependabot.yml");
    const actionUses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map((match) => match[1]);

    assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read\s*$/m);
    assert.match(workflow, /^\s+push:\s*$/m);
    assert.match(workflow, /^\s+pull_request:\s*$/m);
    assert.doesNotMatch(workflow, /pull_request_target/);
    assert.match(workflow, /ubuntu-latest/);
    assert.match(workflow, /windows-latest/);
    assert.match(workflow, /22\.18\.0/);
    assert.match(workflow, /24\.11\.0/);
    assert.match(workflow, /timeout-minutes:\s*\d+/);
    assert.match(workflow, /run:\s+npm ci/);
    assert.match(workflow, /run:\s+npm test/);
    assert.match(workflow, /run:\s+node scripts\/verify-mvp\.mjs/);
    assert.ok(actionUses.length >= 4);
    for (const use of actionUses) {
      assert.match(use, /^actions\/(?:checkout|setup-node)@[a-f0-9]{40}$/);
    }
    assert.ok(actionUses.includes("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"));
    assert.ok(actionUses.includes("actions/setup-node@820762786026740c76f36085b0efc47a31fe5020"));
    assert.match(dependabot, /package-ecosystem:\s*"?npm"?/);
    assert.match(dependabot, /package-ecosystem:\s*"?github-actions"?/);
  });
});
