import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeComponentDesignEvidence } from "../../dist/analyzers/component-design-description.js";

const node = (overrides = {}) => ({ id: 1, parentId: null, tag: "section", classes: ["card"], attributes: {}, text: "", sourceFile: "src/Card.tsx", inlineStyle: {}, events: [], conditional: false, ...overrides });
function describeEvidence(css = "", nodes = [node()], options = {}) {
  return describeComponentDesignEvidence({ nodes, styles: css ? [{ sourceFile: "src/card.css", css }] : [], unresolved: [], ...options });
}

describe("component design descriptions", () => {
  it("describes a real card layout and visible content with no source syntax", () => {
    const result = describeEvidence(".card { display:flex; flex-direction:column; gap:16px; padding:24px; border-radius:12px; background:#fafafa; }", [node(), node({ id:2, parentId:1, tag:"h2", classes:[], text:"会员方案" }), node({ id:3, parentId:1, tag:"p", classes:[], text:"选择适合你的使用方式" })]);
    for (const word of ["纵向弹性布局", "16px", "24px", "12px", "#fafafa", "会员方案", "选择适合你的使用方式"]) assert.ok(result.prompt.includes(word), word);
    assert.doesNotMatch(result.prompt, /```|src\/|className|\.card\s*\{|sourceFile|parentId/);
  });
  it("describes a materially different grid fixture", () => {
    const {prompt} = describeEvidence(".card { display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; } .thumb { aspect-ratio:4 / 3; object-fit:cover; }", [node(), node({ id:2,parentId:1,tag:"img",classes:["thumb"],attributes:{alt:"作品封面"} })]);
    assert.match(prompt, /网格布局/); assert.match(prompt, /3 列等宽/); assert.match(prompt, /4\s*\/\s*3/); assert.match(prompt, /裁切.*填满|填满.*裁切/); assert.doesNotMatch(prompt, /纵向弹性布局|柔和|玻璃/);
  });
  it("keeps absence of styling explicit rather than decoding utility names as CSS", () => {
    const {prompt,unresolved} = describeEvidence("", [node({tag:"button",classes:["bg-white","p-6","shadow"],text:"继续"})]);
    assert.match(prompt, /按钮.*继续/); assert.match(prompt, /样式.*不足|样式.*待确认/); assert.doesNotMatch(prompt, /24px|投影|白色|柔和/); assert.ok(unresolved.length);
  });
  it("ignores sibling and unmatched global selectors", () => {
    const {prompt} = describeEvidence(".sibling { background:magenta; box-shadow:0 4px 10px red; } body { background:black; } .card { padding:8px; }");
    assert.match(prompt, /8px/); assert.doesNotMatch(prompt, /magenta|red|black|投影/);
  });
  it("matches descendant and direct child relationships accurately", () => {
    const nodes=[node(),node({id:2,parentId:1,tag:"div",classes:["body"]}),node({id:3,parentId:2,tag:"button",classes:["action"],text:"保存"})];
    const {prompt}=describeEvidence(".card .action { color:#123456; } .card > .action { background:red; } .body > button.action { padding:9px; }",nodes);
    assert.match(prompt, /#123456/); assert.match(prompt, /9px/); assert.doesNotMatch(prompt, /red|红色/);
  });
  it("matches static attributes, ids, and compound simple selectors", () => {
    const {prompt}=describeEvidence('button#confirm.action[type="submit"][aria-pressed="false"] { border-radius:18px; } button[type="reset"] { color:red; }',[node({tag:"button",classes:["action"],attributes:{id:"confirm",type:"submit","aria-pressed":"false"},text:"确认"})]);
    assert.match(prompt, /18px/); assert.doesNotMatch(prompt, /红色/);
  });
  it("limits scoped Vue selectors to the owning source", () => {
    const nodes=[node({sourceFile:"src/Parent.vue"}),node({id:2,parentId:1,tag:"button",classes:["card"],sourceFile:"src/Child.vue",text:"子按钮"})];
    const result=describeEvidence("",nodes,{styles:[{sourceFile:"src/Parent.vue",ownerSourceFile:"src/Parent.vue",css:".card { border-radius:17px; }"}]});
    assert.match(result.prompt, /17px/); assert.equal((result.prompt.match(/17px/g)||[]).length,1);
  });
  it("preserves hover, focus, active and disabled triggers", () => {
    const {prompt}=describeEvidence(".card:hover { transform:translateY(-5px); } .card:focus-visible { outline:2px solid #123456; } .card:active { transform:scale(.96); } .card:disabled { opacity:.4; }",[node({tag:"button"})]);
    assert.match(prompt, /悬停时.*上移 5px/); assert.match(prompt, /键盘焦点.*2px/); assert.match(prompt, /按下时.*0?\.96/); assert.match(prompt, /禁用时.*0?\.4/);
    const interaction=prompt.split("## 交互\n")[1];
    assert.match(interaction,/悬停时/); assert.match(interaction,/键盘焦点/); assert.doesNotMatch(interaction,/未确认具体操作与反馈/);
  });
  it("keeps ancestor hover attached to its actual trigger", () => {
    const {prompt}=describeEvidence(".card:hover .action { opacity:.6; }",[node(),node({id:2,parentId:1,tag:"button",classes:["action"],text:"操作"})]);
    assert.match(prompt, /外层内容区.*悬停.*按钮.*0?\.6/);
  });
  it("keeps media breakpoints conditional", () => {
    const {prompt}=describeEvidence(".card { display:grid; grid-template-columns:repeat(3,1fr); } @media (max-width:640px) { .card { grid-template-columns:1fr; gap:8px; } }");
    assert.match(prompt,/3 列等宽/); assert.match(prompt,/视口宽度.*640px.*1 列|640px.*单列/); assert.match(prompt,/8px/);
  });
  it("renders reduced motion rules as their own condition", () => {
    const {prompt}=describeEvidence(".card { transition:transform 220ms ease; } @media (prefers-reduced-motion:reduce) { .card { transition:none; } }");
    assert.match(prompt,/220ms/); assert.match(prompt,/减少动态效果.*关闭过渡/);
  });
  it("uses the last declaration within a stylesheet", () => {
    const {prompt}=describeEvidence(".card { min-height:204px; transition:transform 160ms ease; } .card { min-height:218px; transition:transform 220ms ease; }");
    assert.match(prompt,/218px/); assert.match(prompt,/220ms/); assert.doesNotMatch(prompt,/204px|160ms/);
  });
  it("honors specificity and important including inline styles", () => {
    const {prompt}=describeEvidence("#main.card { padding:12px; color:#111111; } .card { padding:4px; color:#222222 !important; }",[node({attributes:{id:"main"},inlineStyle:{padding:"20px",color:"#333333"}})]);
    assert.match(prompt,/20px/); assert.match(prompt,/#222222/); assert.doesNotMatch(prompt,/12px|4px|#111111|#333333/);
  });
  it("expands spacing shorthands before applying later overrides", () => {
    const {prompt}=describeEvidence(".card { padding:24px; padding-top:8px; }");
    assert.match(prompt,/上 8px/); assert.match(prompt,/右 24px/); assert.match(prompt,/下 24px/); assert.match(prompt,/左 24px/);
  });
  it("reports ambiguous cross-file cascade rather than picking arbitrary material order", () => {
    const result=describeEvidence("",[node()],{styles:[{sourceFile:"a.css",css:".card { color:#111111; }"},{sourceFile:"b.css",css:".card { color:#222222; }"}]});
    assert.ok(result.unresolved.some(x=>/加载顺序|跨文件|不同样式/.test(x))); assert.doesNotMatch(result.prompt,/#111111|#222222/);
  });
  it("resolves only custom properties actually used by matching nodes", () => {
    const {prompt}=describeEvidence(":root { --accent:#1677ff; --unused:magenta; } .card { color:var(--accent); } .sibling { background:var(--unused); }");
    assert.match(prompt,/#1677ff/); assert.doesNotMatch(prompt,/--accent|magenta|--unused/);
  });
  it("resolves inherited custom properties and explicit fallbacks without guessing missing values", () => {
    const result=describeEvidence(".card { --space:12px; } .action { gap:var(--space); color:var(--unknown, #123456); background:var(--missing); }",[node(),node({id:2,parentId:1,tag:"button",classes:["action"]})]);
    assert.match(result.prompt,/12px/); assert.match(result.prompt,/#123456/); assert.ok(result.unresolved.some(x=>/变量/.test(x))); assert.doesNotMatch(result.prompt,/var\(|--missing/);
  });
  it("describes a gradient and numeric transparency without inferring color brightness", () => {
    const {prompt}=describeEvidence(".card { background:linear-gradient(135deg, #123456, #fedcba); opacity:.8; } .surface { background:rgba(255,255,255,.2); backdrop-filter:blur(12px); }",[node(),node({id:2,parentId:1,classes:["surface"]})]);
    assert.match(prompt,/线性渐变/); assert.match(prompt,/#123456/); assert.match(prompt,/135deg/); assert.match(prompt,/半透明/); assert.match(prompt,/背景模糊.*12px/); assert.doesNotMatch(prompt,/柔和|深色|浅色|高级/);
  });
  it("distinguishes shadow, element blur, backdrop blur and border", () => {
    const {prompt}=describeEvidence(".card { box-shadow:2px 4px 6px 1px #123456; filter:blur(3px); backdrop-filter:blur(9px); border:1px dashed #654321; }");
    assert.match(prompt,/投影.*水平.*2px.*垂直.*4px.*模糊.*6px.*扩散.*1px/); assert.match(prompt,/元素模糊.*3px/); assert.match(prompt,/背景模糊.*9px/); assert.match(prompt,/1px.*虚线/); assert.doesNotMatch(prompt,/柔和/);
  });
  it("does not invent interaction from transitions or event names", () => {
    const result=describeEvidence(".card { transition:opacity 180ms linear; }",[node({tag:"button",text:"操作",events:["onClick"]})]);
    assert.match(result.prompt,/180ms/); assert.match(result.prompt,/匀速/); assert.doesNotMatch(result.prompt,/悬停|跳转|提交|弹窗/); assert.ok(result.unresolved.some(x=>/事件|反馈/.test(x)));
  });
  it("describes only referenced keyframes with actual duration and transforms", () => {
    const {prompt}=describeEvidence("@keyframes pulse { from { transform:scale(1); opacity:1; } 50% { transform:scale(1.2); opacity:.5; } to { transform:scale(1); opacity:1; } } @keyframes unused { to { transform:rotate(99deg); } } .card { animation:pulse 2s ease-in-out infinite; }");
    assert.match(prompt,/关键帧动画/); assert.match(prompt,/2s/); assert.match(prompt,/循环/); assert.match(prompt,/50%.*1\.2.*0?\.5/); assert.doesNotMatch(prompt,/99deg|unused/);
  });
  it("reports unknown animation definitions and complex expressions", () => {
    const result=describeEvidence(".card { animation:external 1s linear; transform:translateY(calc(100% - 2px)); } .card:nth-child(2n) { color:red; }");
    assert.ok(result.unresolved.some(x=>/关键帧/.test(x))); assert.ok(result.unresolved.some(x=>/选择器/.test(x))); assert.ok(result.unresolved.some(x=>/位移|变换|表达式/.test(x))); assert.doesNotMatch(result.prompt,/红色|calc\(/);
  });
  it("reports malformed CSS without producing invented styles", () => {
    const result=describeEvidence(".card { color: red;");
    assert.ok(result.unresolved.some(x=>/样式.*解析|CSS.*解析/.test(x))); assert.doesNotMatch(result.prompt,/红色/);
  });
  it("keeps conditional content conditional and does not expose dynamic expressions", () => {
    const {prompt}=describeEvidence("",[node({tag:"button",text:"打开"}),node({id:2,parentId:1,tag:"p",text:"保存成功",conditional:true})]);
    assert.match(prompt,/条件满足时.*保存成功/); assert.doesNotMatch(prompt,/默认.*保存成功|自动.*保存成功/);
  });
  it("describes accessibility and static control facts without asserting business effects", () => {
    const {prompt}=describeEvidence("",[node({tag:"input",classes:[],attributes:{type:"email",placeholder:"输入邮箱",required:true,disabled:true}}),node({id:2,tag:"img",classes:[],attributes:{alt:"账户头像"}})]);
    assert.match(prompt,/邮箱输入框/); assert.match(prompt,/输入邮箱/); assert.match(prompt,/必填/); assert.match(prompt,/禁用/); assert.match(prompt,/账户头像/);
    const icon=describeEvidence(".icon { fill:none; stroke:currentColor; }",[node({tag:"svg",classes:["icon"]}),node({id:2,parentId:1,tag:"path",classes:[]}),node({id:3,tag:"small",classes:[],text:"操作后可撤销"})]).prompt;
    assert.match(icon,/矢量路径/); assert.match(icon,/辅助文案/); assert.match(icon,/图形不填充/); assert.match(icon,/沿用当前文字颜色/); assert.doesNotMatch(icon,/currentColor|图形填充颜色 none|矢量图形内包含内容区/);
  });
  it("keeps image paths and unsupported implementation properties out of copied text", () => {
    const result=describeEvidence('.card { background-image:url("../private/banner.png"); -webkit-mask-image:url("/secret.svg"); }');
    assert.match(result.prompt,/背景.*图像/); assert.doesNotMatch(result.prompt,/private|banner\.png|secret\.svg|url\(/);
  });
  it("always provides the four requested product sections with explicit unknowns", () => {
    const {prompt}=describeEvidence("",[node({tag:"button",text:"继续"})]);
    assert.deepEqual([...prompt.matchAll(/^## (.+)$/gm)].map(match=>match[1]),["布局","视觉","动效","交互"]);
    assert.match(prompt,/## 动效\n.*未确认/); assert.match(prompt,/## 交互\n.*未确认/);
  });
  it("does not describe a state declaration that loses to the default cascade", () => {
    const {prompt}=describeEvidence(".card { color:#111111 !important; } .card:hover { color:#222222; } .card:hover { opacity:.4; } .card.active { opacity:.8; }",[node({classes:["card","active"]})]);
    assert.match(prompt,/#111111/); assert.match(prompt,/0?\.8/); assert.doesNotMatch(prompt,/#222222|0?\.4/);
  });
  it("does not retain colors replaced through shorthand and longhand declarations", () => {
    const {prompt}=describeEvidence(".card { border:1px solid #111111; border-color:#222222; background:#333333; background-color:#444444; }");
    assert.match(prompt,/#222222/); assert.match(prompt,/#444444/); assert.doesNotMatch(prompt,/#111111|#333333/);
  });
  it("does not treat unsupported CSS values or impossible native states as actual effects", () => {
    const result=describeEvidence(".card { width:banana; color:inherit; } .card:disabled { opacity:.123; } .card::before { content:'internal'; }");
    assert.doesNotMatch(result.prompt,/banana|inherit|\.123|internal/); assert.ok(result.unresolved.length);
    const {prompt}=describeEvidence(".card { outline:1px solid #123456; }");
    assert.match(prompt,/外轮廓/); assert.doesNotMatch(prompt,/焦点外轮廓/);
  });
});
