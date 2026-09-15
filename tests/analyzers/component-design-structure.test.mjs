import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractComponentDesignStructure } from "../../dist/analyzers/component-design-structure.js";

const reactComponent = { name: "Card", filePath: "src/Card.tsx", exportMode: "named", exportName: "Card" };
function extract(source, extra = [], scenario) {
  return extractComponentDesignStructure(reactComponent, {
    materials: [{ filePath: "src/Card.tsx", text: source }, ...extra], scenario,
  });
}

describe("component design structure", () => {
  it("extracts the actual exported JSX hierarchy, inline styles and authored events", () => {
    const result = extract(`
      function Unrelated() { return <aside className="unrelated">旁支</aside>; }
      export function Card({title}) { return <section className="card glass" style={{padding: 12, opacity: 0.8}}>
        <h2>{title}</h2><button onClick={select}>选择</button>
      </section>; }
    `, [{ filePath: "src/shared.css", text: ".card { border-radius: 8px; }" }], { props: { title: "方案对比" } });
    assert.deepEqual(result.nodes.map((node) => node.tag), ["section", "h2", "button"]);
    assert.deepEqual(result.nodes[0].classes, ["card", "glass"]);
    assert.deepEqual(result.nodes[0].inlineStyle, { padding: "12px", opacity: "0.8" });
    assert.equal(result.nodes[1].parentId, result.nodes[0].id);
    assert.equal(result.nodes[1].text, "方案对比");
    assert.equal(result.nodes[2].text, "选择");
    assert.deepEqual(result.nodes[2].events, ["click"]);
    assert.deepEqual(result.styles, [{ sourceFile: "src/shared.css", css: ".card { border-radius: 8px; }" }]);
  });

  it("resolves default arrow exports without interpreting source comments as design instructions", () => {
    const result = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.tsx", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.tsx", text: '/* make everything glass */ const Card = () => <button className="actual">继续</button>; export default Card;' }],
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].text, "继续");
    assert.deepEqual(result.nodes[0].classes, ["actual"]);
    assert.equal(JSON.stringify(result).includes("make everything glass"), false);
  });

  it("extracts Vue hierarchy with scoped ownership, bound literal props and inline declarations", () => {
    const result = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: '<script setup>defineProps({ label: String });</script><template><article class="card" style="padding: 16px"><h2>{{ label }}</h2><button @click="select">选择</button><wbr></article></template><style scoped>.card { border-radius: 12px; }</style>' }],
      scenario: { props: { label: "计划" } },
    });
    assert.deepEqual(result.nodes.map((node) => node.tag), ["article", "h2", "button", "wbr"]);
    assert.equal(result.nodes[1].text, "计划");
    assert.deepEqual(result.nodes[2].events, ["click"]);
    assert.equal(result.nodes[0].inlineStyle.padding, "16px");
    assert.deepEqual(result.styles, [{ sourceFile: "src/Card.vue", ownerSourceFile: "src/Card.vue", css: ".card { border-radius: 12px; }" }]);
  });

  it("preserves conditional branches and reports dynamic classes without invented values", () => {
    const result = extract('export function Card({active,tone}) { return <div className={tone}>{active && <span className="badge">选中</span>}</div>; }');
    assert.deepEqual(result.nodes[0].classes, []);
    assert.equal(result.nodes[1].conditional, true);
    assert.ok(result.unresolved.some((item) => item.includes("动态样式")));
    assert.ok(result.unresolved.some((item) => item.includes("条件")));
  });

  it("keeps Vue template evidence but discards script bindings when platform branches redeclare names", () => {
    const result = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: `<script setup>defineProps({ label: String });</script>
        <script>export default { methods: { open() {
          // #ifdef APP-PLUS
          const initDelay = 900;
          // #endif
          // #ifndef APP-PLUS
          const initDelay = 420;
          // #endif
        } } };</script><template><section><h2>{{ label }}</h2><button>确认</button></section></template>` }],
      scenario: { props: { label: "不能认定的文案" } },
    });
    assert.deepEqual(result.nodes.map((node) => node.tag), ["section", "h2", "button"]);
    assert.equal(result.nodes[1].text, "");
    assert.equal(result.nodes[2].text, "确认");
    assert.ok(result.unresolved.some((item) => item.includes("脚本解析")));
  });

  it("keeps sibling files and uncompiled preprocessor styles out of proven structure", () => {
    const result = extract('export function Card() { return <div><Unknown /></div>; }', [
      { filePath: "src/Page.tsx", text: 'export default () => <div className="unrelated">页面</div>;' },
      { filePath: "src/Card.scss", text: '$spacing: 12px; .card { padding: $spacing; }' },
    ]);
    assert.equal(result.nodes.some((node) => node.classes.includes("unrelated")), false);
    assert.deepEqual(result.styles, []);
    assert.ok(result.unresolved.some((item) => item.includes("预处理")));
    assert.ok(result.unresolved.some((item) => item.includes("子组件")));
  });

  it("does not resolve a prop spelling when a local binding shadows it", () => {
    const result = extract('export function Card(props) { const title = compute(); return <h2>{title}</h2>; }', [], { props: { title: "不能套用" } });
    assert.equal(result.nodes[0].text, "");
    assert.ok(result.unresolved.some((item) => item.includes("文案")));
  });

  it("does not reuse scene props after lexical shadowing or writes", () => {
    for (const source of [
      'export function Card({title}) { if (ok) { const title = "局部标题"; return <h2>{title}</h2>; } }',
      'export function Card({title}) { title = "修改标题"; return <h2>{title}</h2>; }',
      'export function Card(props) { props.title = "修改标题"; return <h2>{props.title}</h2>; }',
    ]) {
      const result = extract(source, [], { props: { title: "不能套用" } });
      assert.equal(result.nodes[0].text, "");
      assert.ok(result.unresolved.some((item) => item.includes("文案")));
    }
    const vue = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: '<script setup>defineProps({ label: String }); const label = "局部标题";</script><template><h2>{{ label }}</h2></template>' }],
      scenario: { props: { label: "不能套用" } },
    });
    assert.equal(vue.nodes[0].text, "");
    assert.ok(vue.unresolved.some((item) => item.includes("文案")));
  });

  it("does not merge conditional text into ordinary content or retain unreachable returns", () => {
    const conditional = extract('export function Card({ok}) { return <span>结果：{ok ? "通过" : "失败"}</span>; }');
    assert.equal(conditional.nodes[0].text, "结果：");
    assert.ok(conditional.unresolved.some((item) => item.includes("条件")));
    const nested = extract('export function Card({shown,ok}) { return shown && <span>{ok ? "通过" : "失败"}</span>; }');
    assert.equal(nested.nodes[0].text, "");
    const dead = extract('export function Card() { return <div>真实结构</div>; return <button>死代码</button>; }');
    assert.deepEqual(dead.nodes.map((node) => node.text), ["真实结构"]);
    const branches = extract('export function Card({ok}) { if (ok) return <div>通过</div>; else return <div>失败</div>; return <button>死代码</button>; }');
    assert.deepEqual(branches.nodes.map((node) => node.text), ["通过", "失败"]);
    assert.ok(branches.nodes.every((node) => node.conditional));
  });

  it("omits false HTML boolean attributes while preserving false ARIA values", () => {
    const react = extract('export function Card() { return <button disabled={false} hidden={false} autoFocus aria-pressed={false}>继续</button>; }');
    assert.deepEqual(react.nodes[0].attributes, { autoFocus: "true", "aria-pressed": "false" });
    const vue = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: '<template><button :disabled="false" :hidden="false" :aria-pressed="false">继续</button></template>' }],
    });
    assert.deepEqual(vue.nodes[0].attributes, { "aria-pressed": "false" });
  });

  it("keeps confirmed React numeric unitless properties without pixel units", () => {
    const result = extract('export function Card() { return <div style={{animationIterationCount: 3, gridArea: 1, strokeDashoffset: 2, padding: 8}}>加载</div>; }');
    assert.deepEqual(result.nodes[0].inlineStyle, { "animation-iteration-count": "3", "grid-area": "1", "stroke-dashoffset": "2", padding: "8px" });
  });

  it("associates external scoped CSS with its exact local Vue source", () => {
    const result = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [
        { filePath: "src/Card.vue", text: '<script setup>import Child from "./child/Child.vue";</script><template><section class="card"><Child /></section></template>' },
        { filePath: "src/child/Child.vue", text: '<template><section class="card">子组件</section></template><style scoped src="../styles/child.css"></style>' },
        { filePath: "src/styles/child.css", text: '.card { border-radius: 99px; }' },
        { filePath: "src/global.css", text: 'body { margin: 0; }' },
      ],
    });
    assert.deepEqual(result.styles, [
      { sourceFile: "src/styles/child.css", ownerSourceFile: "src/child/Child.vue", css: '.card { border-radius: 99px; }' },
      { sourceFile: "src/global.css", css: 'body { margin: 0; }' },
    ]);
    const alias = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: '<template><div /></template><style scoped src="@/styles/card.css"></style>' }],
    });
    assert.deepEqual(alias.styles, []);
    assert.ok(alias.unresolved.some((item) => item.includes("外部样式")));
  });

  it("does not treat attributes before dynamic spreads as proven while retaining later JSX overrides", () => {
    const react = extract('export function Card({attrs}) { return <button className="base" style={{borderRadius: 8}} disabled {...attrs} title="保留">继续</button>; }');
    assert.deepEqual(react.nodes[0].classes, []);
    assert.deepEqual(react.nodes[0].inlineStyle, {});
    assert.deepEqual(react.nodes[0].attributes, { title: "保留" });
    assert.ok(react.unresolved.some((item) => item.includes("动态样式")));
    const vue = extractComponentDesignStructure({ name: "Card", filePath: "src/Card.vue", exportMode: "default" }, {
      materials: [{ filePath: "src/Card.vue", text: '<script setup>const attrs = {style: {borderRadius: "24px"}};</script><template><button style="border-radius:8px" disabled v-bind="attrs">继续</button></template>' }],
    });
    assert.deepEqual(vue.nodes[0].inlineStyle, {});
    assert.deepEqual(vue.nodes[0].attributes, {});
    assert.ok(vue.unresolved.some((item) => item.includes("动态样式")));
  });

  it("rejects an exported component binding that is assigned a different render function", () => {
    const result = extract('export let Card = () => <div>初始版本</div>; Card = () => <button>真实版本</button>;');
    assert.deepEqual(result.nodes, []);
    assert.ok(result.unresolved.some((item) => item.includes("渲染结构无法静态确认")));
    const alias = extract('let Actual = () => <div>初始版本</div>; export {Actual as Card}; Actual = () => <button>真实版本</button>;');
    assert.deepEqual(alias.nodes, []);
    const metadata = extract('export const Card = () => <div>真实结构</div>; Card.displayName = "展示名";');
    assert.equal(metadata.nodes[0].text, "真实结构");
  });

  it("keeps absent source and unknown render contracts explicitly unresolved", () => {
    const missing = extractComponentDesignStructure(reactComponent, { materials: [] });
    assert.deepEqual(missing.nodes, []);
    assert.ok(missing.unresolved.length > 0);
    const unknown = extract('export function Card() { return makeElement(); }');
    assert.deepEqual(unknown.nodes, []);
    assert.ok(unknown.unresolved.length > 0);
  });
});
