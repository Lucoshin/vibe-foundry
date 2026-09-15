import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { readComponentPrompt, writeComponentPrompts } from "../../dist/library/component-prompts.js";

const roots = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-component-prompts-"));
  roots.push(root);
  return root;
}
const record = (filePath = "src/Button.tsx", prompt = "采用横向弹性布局，按钮内容居中，边缘使用圆角。") => ({
  schemaVersion: "0.2.0", componentName: "Button", filePath,
  sourceDigest: createHash("sha256").update(prompt).digest("hex"),
  sourceFiles: [filePath], unresolved: [], prompt,
});
const filename = (filePath) => `${createHash("sha256").update(filePath).digest("hex")}.json`;

describe("component prompt storage", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("writes and reads each component by its normalized relative source path", async () => {
    const root = await fixture();
    const first = record();
    const second = record("src/admin/Button.tsx", "第二个组件");
    await writeComponentPrompts(root, [first, second]);
    assert.deepEqual(await readComponentPrompt(root, "src\\Button.tsx"), first);
    assert.deepEqual(await readComponentPrompt(root, second.filePath), second);
    assert.deepEqual((await readdir(join(root, "component-prompts"))).sort(), [filename(first.filePath), filename(second.filePath)].sort());
  });

  it("does not rewrite unchanged prompts and cleans only stale direct JSON files", async () => {
    const root = await fixture();
    const first = record();
    await writeComponentPrompts(root, [first, record("src/Old.tsx")]);
    const directory = join(root, "component-prompts");
    const path = join(directory, filename(first.filePath));
    await utimes(path, new Date("2020-01-01"), new Date("2020-01-01"));
    const before = (await stat(path)).mtimeMs;
    await writeFile(join(directory, "README.md"), "preserve");
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "nested", "preserve.json"), "nested");
    await writeComponentPrompts(root, [first]);
    assert.equal((await stat(path)).mtimeMs, before);
    assert.deepEqual((await readdir(directory)).sort(), [filename(first.filePath), "README.md", "nested"].sort());
    assert.equal(await readFile(join(directory, "nested", "preserve.json"), "utf8"), "nested");
    await writeComponentPrompts(root, []);
    assert.deepEqual((await readdir(directory)).sort(), ["README.md", "nested"]);
  });

  it("rejects ambiguous writes before creating output", async () => {
    const root = await fixture();
    await assert.rejects(() => writeComponentPrompts(root, [record(), record("src\\Button.tsx")]), /Duplicate component prompt source/);
    assert.deepEqual(await readdir(root), []);
  });

  it("rejects old source prompt records with an explicit redistillation instruction", async () => {
    const root = await fixture();
    const legacy = { ...record(), schemaVersion: "0.1.0", prompt: "export function Button() {}" };
    const directory = join(root, "component-prompts");
    await mkdir(directory);
    await writeFile(join(directory, filename(legacy.filePath)), JSON.stringify(legacy));
    await assert.rejects(() => readComponentPrompt(root, legacy.filePath), (error) => error.code === "COMPONENT_PROMPT_OUTDATED" && /提示词格式已更新，请重新炼化/.test(error.message));
    await assert.rejects(() => writeComponentPrompts(root, [legacy]), /提示词格式已更新，请重新炼化/);
  });

  it("rejects fields outside the effect prompt record contract before writing", async () => {
    const root = await fixture();
    await assert.rejects(() => writeComponentPrompts(root, [{ ...record(), sourceCode: "export function Button() {}" }]), /Invalid component prompt record/);
    assert.deepEqual(await readdir(root), []);
  });

  it("reports missing and mismatched identities instead of returning another prompt", async () => {
    const root = await fixture();
    await assert.rejects(() => readComponentPrompt(root, "src/Button.tsx"), (error) => error.code === "COMPONENT_PROMPT_MISSING" && /distill/.test(error.message));
    await writeComponentPrompts(root, [record()]);
    await writeFile(join(root, "component-prompts", filename("src/Button.tsx")), JSON.stringify(record("src/Other.tsx")));
    await assert.rejects(() => readComponentPrompt(root, "src/Button.tsx"), /Component prompt identity mismatch/);
    await assert.rejects(() => readComponentPrompt(root, "../outside.tsx"), /relative project file path/);
    await assert.rejects(() => readComponentPrompt(root, "C:\\outside.tsx"), /relative project file path/);
  });

  it("rejects directories redirected outside the asset package", async () => {
    const root = await fixture();
    const external = await fixture();
    await writeFile(join(external, "preserve.json"), "external");
    await symlink(external, join(root, "component-prompts"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(() => writeComponentPrompts(root, [record()]), /Component prompt directory must stay within its asset package/);
    await assert.rejects(() => readComponentPrompt(root, "src/Button.tsx"), /Component prompt directory must stay within its asset package/);
    assert.deepEqual(await readdir(external), ["preserve.json"]);
  });
});
