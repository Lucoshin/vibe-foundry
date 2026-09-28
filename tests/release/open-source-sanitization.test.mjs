import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const currentRunbookDirectory = "docs/runbooks";
const skillPaths = [
  ".agents/skills/vibehub/SKILL.md",
  "plugins/vibehub/skills/vibehub/SKILL.md",
];
const currentSourcePaths = [
  "src/writers/agent-rules-writer.ts",
  "src/web/frontend.ts",
];
const knownBinaryExtensions = new Set([
  ".7z", ".avi", ".avif", ".bin", ".class", ".db", ".dll", ".dylib", ".exe",
  ".flac", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mkv", ".mov",
  ".mp3", ".mp4", ".ogg", ".otf", ".pdf", ".png", ".pyc", ".rar", ".so",
  ".sqlite", ".sqlite3", ".tar", ".tgz", ".ttf", ".wasm", ".wav", ".webm",
  ".webp", ".woff", ".woff2", ".zip",
]);

async function listTextFiles(entry) {
  const absoluteEntry = join(repositoryRoot, entry);
  if (extname(entry)) {
    return [entry];
  }
  const entries = await readdir(absoluteEntry, { withFileTypes: true });
  const nested = await Promise.all(entries.map((candidate) => {
    const relativePath = join(entry, candidate.name);
    if (candidate.isDirectory()) {
      return listTextFiles(relativePath);
    }
    return [relativePath];
  }));
  return nested.flat().filter((path) => [".md", ".ts"].includes(extname(path)));
}

async function readRepositoryText(path) {
  return readFile(join(repositoryRoot, path), "utf8");
}

function listPublicCandidatePaths() {
  return execFileSync(
    "git",
    ["-c", "core.excludesFile=", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot },
  )
    .toString("utf8")
    .split("\0")
    .filter(path => path && existsSync(join(repositoryRoot, path)));
}

async function readPublicCandidateText(path) {
  const bytes = await readFile(join(repositoryRoot, path));
  const normalizedPath = path.replaceAll("\\", "/");
  assert.equal(
    bytes.subarray(0, 8192).includes(0),
    false,
    `unexpected binary public candidate: ${normalizedPath}`,
  );
  return bytes.toString("utf8");
}

function forbiddenPrivateTraces() {
  const windowsSeparator = String.raw`[\\/]{1,2}`;
  return [
    new RegExp(["[A-Z]", ":", windowsSeparator, "Users", windowsSeparator, "[A-Za-z0-9._-]+"].join(""), "iu"),
    new RegExp(["(?:/", "Users|/", "home)/", "[A-Za-z0-9._-]+"].join(""), "u"),
    new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE", " KEY-----"].join(""), "u"),
    new RegExp(["gh", "p_", "[A-Za-z0-9]{36,}"].join(""), "u"),
    new RegExp(["github", "_pat_", "[A-Za-z0-9_]{20,}"].join(""), "u"),
    new RegExp(["AK", "IA", "[A-Z0-9]{16}"].join(""), "u"),
    new RegExp(["sk", "-", "[A-Za-z0-9_-]{20,}"].join(""), "u"),
    new RegExp([
      "(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)",
      "\\s*[:=]\\s*",
      "[\"']?[A-Za-z0-9_./+=-]{20,}",
    ].join(""), "iu"),
    new RegExp(["D", ":", windowsSeparator, "Work", "Projects"].join(""), "iu"),
    new RegExp(["D", ":", windowsSeparator, "Vibe", "Foundry"].join(""), "iu"),
    new RegExp(["Info", "Merge"].join(""), "iu"),
    new RegExp(["Lingdian", "Linggong"].join(""), "iu"),
    new RegExp(["0", "dian"].join(""), "iu"),
    new RegExp(["recruit", "_project"].join(""), "iu"),
  ];
}

describe("open-source sanitization", () => {
  it("keeps local development records out of the public Git index", () => {
    const paths = listPublicCandidatePaths();
    const privatePaths = paths.filter(path => /^(?:docs\/(?!runbooks\/|USAGE\.md$)|(?:AGENTS|CLAUDE|KILO)\.md$|[^/]+\.pen$|\.(?:claude|kilo|codex|gitnexus)\/|output\/)/u.test(path));
    assert.deepEqual(privatePaths, []);
  });


  it("includes TSX, JSON/YAML, dotfiles, and extensionless public candidates", async () => {
    const paths = listPublicCandidatePaths();
    const expectedTextCandidates = [
      "examples/fixture-project/src/components/Button.tsx",
      "package.json",
      ".github/workflows/ci.yml",
      ".gitignore",
      "LICENSE",
    ];

    for (const path of expectedTextCandidates) {
      assert.ok(paths.includes(path), path);
      assert.notEqual(await readPublicCandidateText(path), null, path);
    }
  });

  it("excludes local binary artifacts from public candidates", async () => {
    const paths = listPublicCandidatePaths();
    const detectedBinaryPaths = [];
    for (const path of paths) {
      const bytes = await readFile(join(repositoryRoot, path));
      if (knownBinaryExtensions.has(extname(path).toLowerCase())
        || bytes.subarray(0, 8192).includes(0)) {
        detectedBinaryPaths.push(path.replaceAll("\\", "/"));
      }
    }
    const expectedBinaryPaths = [];

    assert.deepEqual(detectedBinaryPaths.sort(), expectedBinaryPaths);

  });

  it("excludes generated GitNexus skills and local databases while retaining the project skill", async () => {
    const paths = listPublicCandidatePaths();
    const generatedSkillPaths = paths.filter((path) => (
      /^\.(?:claude|agents)\/skills\/gitnexus(?:[\/-]|$)/u.test(path)
    ));
    const gitignore = await readRepositoryText(".gitignore");

    assert.deepEqual(generatedSkillPaths, []);
    assert.ok(paths.includes(".agents/skills/vibehub/SKILL.md"));
    assert.match(gitignore, /^\.claude\/skills\/gitnexus\*\/$/mu);
    assert.match(gitignore, /^\.agents\/skills\/gitnexus\*\/$/mu);
    assert.match(gitignore, /^\*\.db$/mu);
    assert.match(gitignore, /^\*\.sqlite$/mu);
    assert.match(gitignore, /^\*\.sqlite3$/mu);
  });

  it("keeps environment files, databases, archives, and generated report directories out of public candidates", async () => {
    const paths = listPublicCandidatePaths();
    const forbiddenCandidatePaths = paths.filter((path) => {
      const normalizedPath = path.replaceAll("\\", "/");
      const isEnvironmentFile = /(^|\/)\.env(?:\..+)?$/u.test(normalizedPath)
        && normalizedPath !== ".env.example"
        && !normalizedPath.endsWith("/.env.example");
      const isDatabaseOrArchive = /\.(?:db|sqlite|sqlite3|zip|tar|tgz|gz|7z|rar)$/iu.test(normalizedPath);
      const isGeneratedReport = /^(?:coverage|test-results|playwright-report)\//u.test(normalizedPath);
      return isEnvironmentFile || isDatabaseOrArchive || isGeneratedReport;
    });
    const gitignore = await readRepositoryText(".gitignore");

    assert.deepEqual(forbiddenCandidatePaths, []);
    for (const pattern of [
      ".env",
      ".env.*",
      "!.env.example",
      "*.db",
      "*.sqlite",
      "*.sqlite3",
      "*.zip",
      "*.tar",
      "*.tar.gz",
      "*.tgz",
      "*.gz",
      "*.7z",
      "*.rar",
      "coverage/",
      "test-results/",
      "playwright-report/",
    ]) {
      assert.ok(gitignore.split(/\r?\n/u).includes(pattern), pattern);
    }
  });

  it("detects generic personal-home and high-signal secret traces", () => {
    const forbiddenTraces = forbiddenPrivateTraces();
    const samples = [
      ["C", ":\\", "Users", "\\", "someone", "\\", "repo"].join(""),
      ["/", "Users", "/", "someone", "/", "repo"].join(""),
      ["/", "home", "/", "someone", "/", "repo"].join(""),
      ["-----BEGIN ", "PRIVATE", " KEY-----"].join(""),
      ["gh", "p_", "a".repeat(36)].join(""),
      ["github", "_pat_", "a".repeat(30)].join(""),
      ["AK", "IA", "A".repeat(16)].join(""),
      ["sk", "-", "a".repeat(24)].join(""),
      ["api", "_key", "=", "a".repeat(24)].join(""),
    ];

    for (const sample of samples) {
      assert.ok(forbiddenTraces.some((pattern) => pattern.test(sample)), sample);
    }
  });

  it("keeps developer-private paths and project names out of the public text surface", async () => {
    const paths = listPublicCandidatePaths();
    const forbiddenTraces = forbiddenPrivateTraces();
    const findings = [];

    for (const path of paths) {
      const text = await readPublicCandidateText(path);
      if (text === null) continue;
      for (const pattern of forbiddenTraces) {
        if (pattern.test(text)) {
          findings.push(`${path}: ${pattern.source}`);
        }
      }
    }

    assert.deepEqual(findings, []);
  });

  it("keeps current runbooks, skills, generated rules, and web empty state central-only", async () => {
    const runbookPaths = await listTextFiles(currentRunbookDirectory);
    const contractPaths = [...runbookPaths, ...skillPaths, ...currentSourcePaths];

    for (const path of [...runbookPaths, ...skillPaths]) {
      const text = await readRepositoryText(path);
      assert.match(text, /集中资产库|central(?:ized)? asset library/iu, path);
    }
    for (const path of currentSourcePaths) {
      const text = await readRepositoryText(path);
      assert.match(text, /集中资产库|集中资产包/iu, path);
    }
    for (const path of contractPaths) {
      const text = await readRepositoryText(path);
      assert.doesNotMatch(
        text,
        /\.vibehub[\\/](?!library(?:[\\/]|`|\b))/iu,
        path,
      );
      assert.doesNotMatch(
        text,
        /(?:没有找到|只读取|inspect|读取|检查)[^\n]{0,48}(?:^|[\s`"\/])\.vibehub(?:\s+asset package|\s*资产包)?/iu,
        path,
      );
    }
  });

  it("keeps generated GitNexus skill copies out of the public Git index", () => {
    const tracked = execFileSync(
      "git",
      [
        "ls-files",
        "--",
        ":(glob).claude/skills/gitnexus*/**",
        ":(glob).agents/skills/gitnexus*/**",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    ).trim();

    assert.equal(tracked, "");
  });

});
