import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("web asset browser runbook", () => {
  it("documents startup, UI structure, API, and Pencil design verification", async () => {
    const runbook = await readFile("docs/runbooks/use-web-asset-browser.md", "utf8");

    assert.match(runbook, /# 使用 Web Asset Browser/);
    assert.match(runbook, /node dist\/cli\.js web --port 4317/);
    assert.match(runbook, /node dist\/cli\.js web <project-root> --port 4317/);
    assert.match(runbook, /VIBE_FOUNDRY_LIBRARY_ROOT/);
    assert.match(runbook, /<user-home>\/\.vibe-foundry\/library/);
    assert.match(runbook, /GET \/api\/assets/);
    assert.match(runbook, /暖白与中性灰/);
    assert.match(runbook, /悬停只强调边框/);
    assert.match(runbook, /前 6 个可构建组件/);
    assert.match(runbook, /最多同时构建 2 个/);
    assert.match(runbook, /返回时保留列表位置/);
    assert.match(runbook, /Pencil MCP/);
    assert.match(runbook, /VibeFoundry\.pen/);
    assert.match(runbook, /Overview、Asset Library、Reports 和 Missing Package/);
    assert.match(runbook, /组件标签编辑和删除只保存为浏览器本地视图状态/);
    assert.match(runbook, /组件列表上方可按标签和项目筛选/);
    assert.match(runbook, /普通 Vue SFC/);
    assert.match(runbook, /同一个 Web 服务/);
    assert.match(runbook, /组件预览[^\n]{0,120}可信源码/);
    assert.match(runbook, /同源[^\n]{0,120}父窗口[^\n]{0,120}(?:其他|其余) API/);
    assert.match(runbook, /networkPolicy[^\n]{0,120}不是[^\n]{0,40}安全沙箱/);
    assert.doesNotMatch(runbook, /node dist\/cli\.js preview <project-root> --component <component-name-or-id> --port 5173/);
    assert.match(runbook, /snapshot_layout/);
    assert.match(runbook, /output\/pencil-web-design\/AJTN7\.png/);
    assert.match(runbook, /output\/playwright\/web-asset-browser-desktop\.png/);
    assert.match(runbook, /output\/playwright\/web-asset-browser-mobile\.png/);
  });
});
