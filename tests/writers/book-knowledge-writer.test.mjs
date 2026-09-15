import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "node:test";
import { renderBookKnowledgeFiles } from "../../dist/writers/book-knowledge-writer.js";

const evidence = (quote = "灯塔需要每晚点亮。") => ({ unitId: "unit-1", quote, startOffset: 0, endOffset: quote.length, startLine: 1, endLine: 1 });
function fixture() {
  return {
    schemaVersion: "0.2.0", kind: "book-knowledge", title: "灯塔之城", sourcePath: "D:/books/灯塔.txt", sourceDigest: "a".repeat(64),
    processedChunkIds: ["chunk-1"], documentStats: { unitCount: 5, chunkCount: 1, characterCount: 120 },
    entities: [
      { id: "w1", type: "worldview", name: "守灯规则", aliases: [], facets: [{ name: "规则", value: "灯塔需要每晚点亮。", basis: "explicit", evidence: [evidence()] }] },
      { id: "c1", type: "character", name: "阿澄", aliases: ["守灯人"], facets: [{ name: "职责", value: "阿澄负责守灯。", basis: "explicit", evidence: [evidence("阿澄负责守灯。")] }] },
      { id: "s1", type: "setting", name: "灯塔", aliases: [], facets: [{ name: "位置", value: "灯塔立在海岬。", basis: "explicit", evidence: [evidence("灯塔立在海岬。")] }] },
      { id: "n1", type: "concept", name: "共同守护", aliases: [], facets: [{ name: "含义", value: "守灯可能代表共同承担。", basis: "interpretation", evidence: [evidence()] }] },
      { id: "m1", type: "metaphor", name: "灯与希望", aliases: [], facets: [{ name: "解读", value: "灯可解读为希望。", basis: "interpretation", evidence: [evidence()] }] },
    ],
    relations: [{ id: "r1", from: "c1", to: "s1", type: "守护", description: "阿澄守护灯塔。", basis: "explicit", evidence: [evidence("阿澄负责守灯。")] }],
    uncertainties: [{ description: "灯是否一直象征希望尚待核对。", evidence: [] }],
  };
}

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.value = "all"; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Untrusted HTML insertion is forbidden"); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ""; this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}
function runViewer(html) {
  const data = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)[1];
  const elements = new Map(["book-data", "type-filter", "network", "network-status", "node-detail", "uncertainties"].map((id) => [id, new Element(id)]));
  elements.get("book-data").textContent = data;
  const context = vm.createContext({ document: { getElementById: (id) => elements.get(id), createElement: (tag) => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) } });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);
  return { context, elements, nodes: () => descendants(elements.get("network")).filter((node) => node.attributes["data-entity-id"]), edges: () => descendants(elements.get("network")).filter((node) => node.attributes["data-relation-id"]) };
}

function pathSamples(path) {
  const points = [];
  let current;
  for (const [, command, coordinates] of path.matchAll(/([MLC])([^MLC]*)/g)) {
    const values = coordinates.trim().split(/[ ,]+/).map(Number);
    if (command === "M") { current = { x: values[0], y: values[1] }; points.push(current); continue; }
    const start = current;
    const end = command === "L" ? { x: values[0], y: values[1] } : { x: values[4], y: values[5] };
    for (let step = 1; step <= 100; step += 1) {
      const t = step / 100;
      points.push(command === "L" ? { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t } : {
        x: (1 - t) ** 3 * start.x + 3 * (1 - t) ** 2 * t * values[0] + 3 * (1 - t) * t ** 2 * values[2] + t ** 3 * end.x,
        y: (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * values[1] + 3 * (1 - t) * t ** 2 * values[3] + t ** 3 * end.y,
      });
    }
    current = end;
  }
  return points;
}

describe("book knowledge writer", () => {
  it("renders the seven deterministic files from the unchanged validated asset", () => {
    const asset = fixture();
    const before = structuredClone(asset);
    const files = renderBookKnowledgeFiles(asset);
    assert.deepEqual(Object.keys(files).sort(), ["book-report.md", "worldview.md", "characters.md", "settings.md", "concepts-and-metaphors.md", "knowledge-network.json", "knowledge-network.html"].sort());
    assert.deepEqual(JSON.parse(files["knowledge-network.json"]), asset);
    assert.deepEqual(asset, before);
    assert.deepEqual(renderBookKnowledgeFiles(asset), files);
    for (const name of ["book-report.md", "worldview.md", "characters.md", "settings.md", "concepts-and-metaphors.md"]) {
      assert.match(files[name], /来源核验不等于内容判真/);
      assert.match(files[name], /灯塔之城/);
    }
  });

  it("keeps authored facets, directed relationships, basis and exact evidence in readable cards", () => {
    const files = renderBookKnowledgeFiles(fixture());
    const characters = files["characters.md"];
    for (const text of ["阿澄", "c1", "守灯人", "职责", "阿澄负责守灯。", "原文明示", "守护", "灯塔", String.raw`unit\-1`, "第 1 行"]) assert.ok(characters.includes(text), text);
    assert.match(characters, /阿澄.*→.*灯塔/);
    assert.doesNotMatch(characters, /first_mes|开场白|年龄：|性格：/);
    assert.match(files["concepts-and-metaphors.md"], /解读/);
    assert.match(files["concepts-and-metaphors.md"], /共同守护/);
    assert.match(files["concepts-and-metaphors.md"], /灯与希望/);
    assert.match(files["book-report.md"], /尚待核对/);
    assert.match(files["book-report.md"], /提交者声明/);
  });

  it("shows empty categories and an empty offline graph without inventing assets", () => {
    const asset = { ...fixture(), entities: [], relations: [], uncertainties: [] };
    const files = renderBookKnowledgeFiles(asset);
    assert.match(files["characters.md"], /暂无人物角色资产/);
    assert.match(files["worldview.md"], /暂无世界观资产/);
    assert.match(files["settings.md"], /暂无设定资产/);
    const viewer = runViewer(files["knowledge-network.html"]);
    assert.equal(viewer.nodes().length, 0);
    assert.match(viewer.elements.get("network-status").textContent, /没有可显示/);
    assert.match(viewer.elements.get("node-detail").textContent, /选择/);
  });

  it("filters the offline SVG and opens exact node facets and relationship evidence by click or keyboard", () => {
    const viewer = runViewer(renderBookKnowledgeFiles(fixture())["knowledge-network.html"]);
    assert.equal(viewer.nodes().length, 5);
    assert.equal(viewer.edges().length, 1);
    const character = viewer.nodes().find((node) => node.attributes["data-entity-id"] === "c1");
    character.listeners.click();
    assert.equal(viewer.nodes().find((node) => node.attributes["data-entity-id"] === "c1"), character, "Selection must preserve keyboard focus on the existing SVG node");
    const detail = viewer.elements.get("node-detail").textContent;
    for (const text of ["阿澄", "职责", "守灯人", "阿澄负责守灯。", "原文明示", "守护", "灯塔", "unit-1", "第 1 行"]) assert.ok(detail.includes(text), text);
    assert.match(detail, /阿澄.*→.*灯塔/);
    const filter = viewer.elements.get("type-filter");
    filter.value = "metaphor";
    filter.listeners.change();
    assert.deepEqual(viewer.nodes().map((node) => node.attributes["data-entity-id"]), ["m1"]);
    assert.equal(viewer.edges().length, 0);
    assert.doesNotMatch(viewer.elements.get("node-detail").textContent, /阿澄/);
    viewer.nodes()[0].listeners.keydown({ key: "Enter", preventDefault() {} });
    assert.match(viewer.elements.get("node-detail").textContent, /灯可解读为希望/);
    assert.match(viewer.elements.get("node-detail").textContent, /解读/);
  });

  it("routes same-column and cross-column edges around unrelated nodes and category headings", () => {
    const asset = fixture();
    asset.entities.push(...["c2", "c3", "c4"].map((id) => ({ ...structuredClone(asset.entities[1]), id, name: id })));
    asset.entities.push(...["s2", "s3"].map((id) => ({ ...structuredClone(asset.entities[2]), id, name: id })));
    const relation = (id, from, to) => ({ ...structuredClone(asset.relations[0]), id, from, to });
    asset.relations.push(relation("cross", "w1", "s1"), relation("same", "c3", "c1"), relation("adjacent", "s3", "c1"), relation("reverse", "m1", "w1"), relation("self", "s2", "s2"));
    const viewer = runViewer(renderBookKnowledgeFiles(asset)["knowledge-network.html"]);
    const assertClearRoutes = () => {
      const rectangles = new Map(viewer.nodes().map((node) => {
        const rect = node.children.find((child) => child.tagName === "rect").attributes;
        return [node.attributes["data-entity-id"], { x: Number(rect.x), y: Number(rect.y), width: Number(rect.width), height: Number(rect.height) }];
      }));
      const headings = viewer.elements.get("network").children.filter((child) => child.attributes.class === "column-label");
      for (const edge of viewer.edges()) {
        const relation = asset.relations.find((item) => item.id === edge.attributes["data-relation-id"]);
        const samples = pathSamples(edge.children.find((child) => child.tagName === "path").attributes.d);
        assert.ok(samples.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), relation.id);
        for (const [id, rect] of rectangles) {
          if (id === relation.from || id === relation.to) continue;
          assert.ok(!samples.some((point) => point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height), relation.id + " crosses unrelated node " + id);
        }
        for (const heading of headings) {
          const x = Number(heading.attributes.x), y = Number(heading.attributes.y);
          assert.ok(!samples.some((point) => point.x >= x && point.x <= x + 120 && point.y >= y - 15 && point.y <= y + 5), relation.id + " crosses category heading");
        }
        for (const [point, id] of [[samples[0], relation.from], [samples.at(-1), relation.to]]) {
          const rect = rectangles.get(id);
          assert.ok(point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height, relation.id + " endpoint outside " + id);
          assert.ok(point.x === rect.x || point.x === rect.x + rect.width || point.y === rect.y || point.y === rect.y + rect.height, relation.id + " endpoint not on " + id);
        }
      }
    };
    assert.equal(viewer.nodes().length, 10);
    assert.equal(viewer.edges().length, asset.relations.length);
    assertClearRoutes();
    const filter = viewer.elements.get("type-filter");
    filter.value = "character";
    filter.listeners.change();
    assert.equal(viewer.edges().length, 1);
    assertClearRoutes();
  });

  it("escapes hostile book and model text without executing scripts or fetching remote assets", () => {
    const asset = fixture();
    const hostile = '</script><script>globalThis.PWNED = true</script><img src=x onerror="globalThis.PWNED=true">';
    asset.title = hostile;
    asset.entities[1].name = hostile;
    asset.entities[1].facets[0].value = hostile;
    asset.entities[1].facets[0].evidence[0].quote = hostile;
    const files = renderBookKnowledgeFiles(asset);
    const html = files["knowledge-network.html"];
    assert.equal((html.match(/<script\b/g) ?? []).length, 2);
    assert.doesNotMatch(html, /<img src=x|<script[^>]+src=|@import|<link[^>]+href=/i);
    assert.doesNotMatch(files["characters.md"], /<script>|<img/);
    const viewer = runViewer(html);
    viewer.nodes().find((node) => node.attributes["data-entity-id"] === "c1").listeners.click();
    assert.equal(viewer.context.PWNED, undefined);
    assert.ok(viewer.elements.get("node-detail").textContent.includes(hostile));
    assert.deepEqual(JSON.parse(files["knowledge-network.json"]), asset);
  });
});
