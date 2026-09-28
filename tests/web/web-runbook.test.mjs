import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("web asset browser runbook", () => {
  it("documents startup, UI structure, and API", async () => {
    const runbook = await readFile("docs/runbooks/use-web-asset-browser.md", "utf8");

    assert.match(runbook, /# 使用 Web Asset Browser/);
    assert.match(runbook, /node dist\/cli\.js web --port 4317/);
    assert.match(runbook, /node dist\/cli\.js web <project-root> --port 4317/);
    assert.match(runbook, /VIBEHUB_LIBRARY_ROOT/);
    assert.match(runbook, /<user-home>\/\.vibehub\/library/);
    assert.match(runbook, /GET \/api\/assets/);
    assert.match(runbook, /暖白与中性灰/);
    assert.match(runbook, /悬停只强调边框/);
    assert.match(runbook, /每页显示 24 项资产/);
    assert.match(runbook, /最多同时构建 2 个/);
    assert.match(runbook, /返回时保留列表位置/);
    assert.match(runbook, /组件标签编辑和删除只保存为浏览器本地视图状态/);
    assert.match(runbook, /资产库[\s\S]*来源库[\s\S]*学习任务[\s\S]*应用记录[\s\S]*炼化方案/);
    assert.match(runbook, /类型\/来源\/语言组合筛选/);
    assert.match(runbook, /src\/application\/asset-catalog\.ts/);
    assert.doesNotMatch(runbook, /组件列表上方可按标签和项目筛选/);
    assert.match(runbook, /普通 Vue SFC/);
    assert.match(runbook, /同一个 Web 服务/);
    assert.match(runbook, /组件预览[^\n]{0,120}可信源码/);
    assert.match(runbook, /同源[^\n]{0,120}父窗口[^\n]{0,120}(?:其他|其余) API/);
    assert.match(runbook, /networkPolicy[^\n]{0,120}不是[^\n]{0,40}安全沙箱/);
    assert.doesNotMatch(runbook, /node dist\/cli\.js preview <project-root> --component <component-name-or-id> --port 5173/);
  });
});
