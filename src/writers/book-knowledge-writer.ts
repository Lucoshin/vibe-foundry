import { BOOK_ENTITY_TYPES } from "../schema/book-knowledge.js";

const typeLabels = { worldview: "世界观", character: "人物角色", setting: "设定", concept: "概念", metaphor: "隐喻" };
const basisLabels = { explicit: "原文明示（分析者标注）", interpretation: "解读（分析者标注）" };
const evidenceNotice = "来源核验不等于内容判真：引文定位只证明文本存在；“原文明示”与“解读”均为分析者标注，仍需结合原书核对。";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function markdown(value) {
  return escapeHtml(value).replace(/[\\`*_{}\[\]()#+.!|~\-]/g, "\\$&");
}

function sourceLocation(source) {
  return `第 ${source.startLine}${source.endLine === source.startLine ? "" : `–${source.endLine}`} 行 · ${source.unitId}`;
}

function evidenceMarkdown(evidence) {
  return evidence.map((source) => `> ${markdown(source.quote).replaceAll("\n", "\n> ")}\n\n来源：${markdown(sourceLocation(source))}\n`).join("\n");
}

function relationMarkdown(relation, entityById, level = 3) {
  const from = entityById.get(relation.from);
  const to = entityById.get(relation.to);
  return `${"#".repeat(level)} ${markdown(relation.type)}\n\n${markdown(from.name)}（${markdown(from.id)}） → ${markdown(to.name)}（${markdown(to.id)}）\n\n${basisLabels[relation.basis]}\n\n${markdown(relation.description)}\n\n${evidenceMarkdown(relation.evidence)}`;
}

function documentHeader(asset, heading) {
  return `# ${markdown(asset.title)} · ${heading}\n\n${evidenceNotice}\n\n`;
}

function renderCards(asset, types, heading, entityById) {
  let content = documentHeader(asset, heading);
  for (const type of types) {
    content += `## ${typeLabels[type]}\n\n`;
    const entities = asset.entities.filter((entity) => entity.type === type);
    if (entities.length === 0) content += `暂无${typeLabels[type]}资产。\n\n`;
    for (const entity of entities) {
      content += `### ${markdown(entity.name)}\n\n标识：${markdown(entity.id)}\n\n`;
      if (entity.aliases.length) content += `别名：${entity.aliases.map(markdown).join("、")}\n\n`;
      for (const facet of entity.facets) {
        content += `#### ${markdown(facet.name)}\n\n${basisLabels[facet.basis]}\n\n${markdown(facet.value)}\n\n${evidenceMarkdown(facet.evidence)}\n`;
      }
      const relations = asset.relations.filter((relation) => relation.from === entity.id || relation.to === entity.id);
      content += `#### 有向关系\n\n${relations.length ? relations.map((relation) => relationMarkdown(relation, entityById, 5)).join("\n") : "暂无记录的关系。\n"}\n`;
    }
  }
  return content;
}

function renderReport(asset, entityById) {
  let content = documentHeader(asset, "书籍知识资产");
  content += `来源：${markdown(asset.sourcePath)}\n\n内容摘要：${asset.sourceDigest}\n\n`;
  content += `文档包含 ${asset.documentStats.unitCount} 个证据单元、${asset.documentStats.chunkCount} 个阅读块、${asset.documentStats.characterCount} 个 UTF-16 代码单元。提交者声明已阅读 ${asset.processedChunkIds.length} 个块；覆盖声明不代表分析准确率。\n\n`;
  content += `## 资产概览\n\n${BOOK_ENTITY_TYPES.map((type) => `- ${typeLabels[type]}：${asset.entities.filter((entity) => entity.type === type).length}`).join("\n")}\n- 有向关系：${asset.relations.length}\n\n`;
  content += "人读卡片：worldview.md、characters.md、settings.md、concepts-and-metaphors.md。离线关系图：knowledge-network.html。结构化资产：knowledge-network.json。\n\n";
  content += `## 有向关系\n\n${asset.relations.length ? asset.relations.map((relation) => relationMarkdown(relation, entityById)).join("\n") : "暂无记录的关系。\n"}\n`;
  content += "## 待核对项\n\n";
  content += asset.uncertainties.length ? asset.uncertainties.map((item) => `- ${markdown(item.description)}\n\n${evidenceMarkdown(item.evidence)}`).join("\n") : "暂无记录的待核对项；这不代表分析已经判真。\n";
  return content;
}

function offlineViewer(labels, basis, types) {
  const asset = JSON.parse(document.getElementById("book-data").textContent);
  const entityById = new Map(asset.entities.map((entity) => [entity.id, entity]));
  const filter = document.getElementById("type-filter");
  const svg = document.getElementById("network");
  const status = document.getElementById("network-status");
  const detail = document.getElementById("node-detail");
  let selectedId = null;
  const nodeElements = new Map();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.setAttribute("class", className);
    return node;
  }

  function shape(tag, attributes, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function short(text, limit) {
    const characters = Array.from(text);
    return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : text;
  }

  function appendEvidence(parent, evidence) {
    for (const source of evidence) {
      parent.append(element("blockquote", source.quote));
      const line = source.startLine === source.endLine ? `${source.startLine}` : `${source.startLine}–${source.endLine}`;
      parent.append(element("p", `第 ${line} 行 · ${source.unitId}`, "evidence-location"));
    }
  }

  function renderDetail() {
    detail.replaceChildren();
    if (selectedId === null) {
      detail.append(element("h2", "选择一个节点"), element("p", "查看条目、分析依据及它与其他资产的有向关系。", "muted"));
      return;
    }
    const entity = entityById.get(selectedId);
    detail.append(element("p", `${labels[entity.type]} · ${entity.id}`, "eyebrow"), element("h2", entity.name));
    if (entity.aliases.length) detail.append(element("p", `别名：${entity.aliases.join("、")}`, "muted"));
    for (const facet of entity.facets) {
      const card = element("section", undefined, "facet");
      card.append(element("h3", facet.name), element("p", basis[facet.basis], `basis ${facet.basis}`), element("p", facet.value));
      appendEvidence(card, facet.evidence);
      detail.append(card);
    }
    detail.append(element("h3", "有向关系"));
    const relations = asset.relations.filter((relation) => relation.from === entity.id || relation.to === entity.id);
    if (relations.length === 0) detail.append(element("p", "暂无记录的关系。", "muted"));
    for (const relation of relations) {
      const card = element("section", undefined, "facet relation");
      const from = entityById.get(relation.from);
      const to = entityById.get(relation.to);
      card.append(element("h4", relation.type), element("p", `${from.name}（${from.id}） → ${to.name}（${to.id}）`), element("p", basis[relation.basis], `basis ${relation.basis}`), element("p", relation.description));
      appendEvidence(card, relation.evidence);
      detail.append(card);
    }
  }

  function renderGraph() {
    svg.replaceChildren();
    nodeElements.clear();
    const visible = asset.entities.filter((entity) => filter.value === "all" || entity.type === filter.value);
    const visibleIds = new Set(visible.map((entity) => entity.id));
    const relations = asset.relations.filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to));
    const columns = types.filter((type) => visible.some((entity) => entity.type === type));
    const columnOf = (id) => columns.indexOf(entityById.get(id).type);
    const topChannels = new Map(relations.filter((relation) => Math.abs(columnOf(relation.from) - columnOf(relation.to)) > 1)
      .map((relation, index) => [relation.id, 60 + index * 14]));
    const firstRowY = topChannels.size ? 90 + topChannels.size * 14 : 64;
    const rows = new Map(columns.map((type) => [type, 0]));
    const positions = new Map();
    for (const entity of visible) {
      positions.set(entity.id, { x: 28 + columns.indexOf(entity.type) * 214, y: firstRowY + rows.get(entity.type) * 114 });
      rows.set(entity.type, rows.get(entity.type) + 1);
    }
    const height = Math.max(420, ...[...rows.values()].map((count) => count * 114 + firstRowY + 6));
    svg.setAttribute("viewBox", `0 0 ${Math.max(450, columns.length * 214 + 28)} ${height}`);
    svg.setAttribute("height", height);
    const defs = shape("defs", {});
    const arrow = shape("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    arrow.append(shape("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#8b968f" }));
    defs.append(arrow);
    svg.append(defs);
    columns.forEach((type, index) => svg.append(shape("text", { x: 28 + index * 214, y: 31, class: "column-label" }, `${labels[type]} · ${rows.get(type)}`)));

    for (const relation of relations) {
      const from = positions.get(relation.from);
      const to = positions.get(relation.to);
      let path;
      if (relation.from === relation.to) {
        const side = from.x + 172;
        path = `M ${side} ${from.y + 20} C ${side + 28} ${from.y - 10}, ${side + 28} ${from.y + 82}, ${side} ${from.y + 54}`;
      } else if (from.x === to.x) {
        const side = from.x + 172;
        path = `M ${side} ${from.y + 36} C ${side + 28} ${from.y + 36}, ${side + 28} ${to.y + 36}, ${side} ${to.y + 36}`;
      } else {
        const direction = to.x > from.x ? 1 : -1;
        const startX = from.x + (direction === 1 ? 172 : 0);
        const endX = to.x + (direction === 1 ? 0 : 172);
        const startY = from.y + 36;
        const endY = to.y + 36;
        if (topChannels.has(relation.id)) {
          const sourceGap = startX + direction * 21;
          const targetGap = endX - direction * 21;
          const channelY = topChannels.get(relation.id);
          path = `M ${startX} ${startY} L ${sourceGap} ${startY} L ${sourceGap} ${channelY} L ${targetGap} ${channelY} L ${targetGap} ${endY} L ${endX} ${endY}`;
        } else {
          const gap = (startX + endX) / 2;
          path = `M ${startX} ${startY} L ${gap} ${startY} L ${gap} ${endY} L ${endX} ${endY}`;
        }
      }
      const group = shape("g", { "data-relation-id": relation.id, class: `edge ${relation.basis}` });
      group.append(shape("path", { d: path, fill: "none", "marker-end": "url(#arrow)" }));
      group.append(shape("title", {}, `${entityById.get(relation.from).name} → ${entityById.get(relation.to).name}：${relation.type}；${basis[relation.basis]}`));
      svg.append(group);
    }
    for (const entity of visible) {
      const point = positions.get(entity.id);
      const group = shape("g", { "data-entity-id": entity.id, "data-type": entity.type, class: `node${selectedId === entity.id ? " selected" : ""}`, role: "button", tabindex: 0, "aria-label": `${entity.name}，${labels[entity.type]}，${entity.id}`, "aria-pressed": selectedId === entity.id ? "true" : "false" });
      group.append(shape("rect", { x: point.x, y: point.y, width: 172, height: 72, rx: 10 }));
      group.append(shape("text", { x: point.x + 14, y: point.y + 29, class: "node-name" }, short(entity.name, 12)));
      group.append(shape("text", { x: point.x + 14, y: point.y + 51, class: "node-id" }, short(entity.id, 22)));
      group.append(shape("title", {}, `${entity.name}（${entity.id}）`));
      nodeElements.set(entity.id, group);
      const select = () => {
        selectedId = entity.id;
        for (const [id, node] of nodeElements) {
          node.setAttribute("class", id === selectedId ? "node selected" : "node");
          node.setAttribute("aria-pressed", id === selectedId ? "true" : "false");
        }
        renderDetail();
      };
      group.addEventListener("click", select);
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
      svg.append(group);
    }
    status.textContent = visible.length ? `显示 ${visible.length} 个节点、${relations.length} 条有向关系。箭头表示关系方向；虚线表示解读。选择节点查看完整内容与证据。` : "当前类型没有可显示的资产。";
  }

  const uncertainties = document.getElementById("uncertainties");
  uncertainties.append(element("h2", "待核对项"));
  if (asset.uncertainties.length === 0) uncertainties.append(element("p", "暂无记录的待核对项；这不代表分析已经判真。", "muted"));
  for (const item of asset.uncertainties) {
    const card = element("section", undefined, "facet");
    card.append(element("p", item.description));
    appendEvidence(card, item.evidence);
    uncertainties.append(card);
  }
  filter.addEventListener("change", () => { selectedId = null; renderGraph(); renderDetail(); });
  renderGraph();
  renderDetail();
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function renderNetworkHtml(asset) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(asset.title)} · 知识网络</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f5ef;color:#253b35;font:15px/1.75 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:32px}h1{margin:4px 0 12px;font-size:30px;line-height:1.4}h2,h3,h4{line-height:1.5;margin:0 0 12px}p{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.eyebrow{color:#54745b;font-size:12px;letter-spacing:.06em}.notice{padding:12px 16px;background:#e9ede2;border-left:3px solid #728568;font-size:13px}.muted,.evidence-location{color:#6b776f;font-size:13px}.toolbar{display:flex;align-items:center;gap:12px;margin:22px 0 12px}select{font:inherit;color:inherit;background:#fffef9;border:1px solid #adb7aa;border-radius:6px;padding:6px 12px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:20px;align-items:start}.graph,.detail,.uncertainties{background:#fffef9;border:1px solid #d7dcd0;border-radius:12px}.graph{overflow:auto;max-height:75vh;padding:10px}svg{display:block;width:100%;min-width:450px}.detail{padding:22px;max-height:75vh;overflow:auto}.facet{margin:18px 0;padding-top:16px;border-top:1px solid #e3e6dc}.basis{display:inline-block;font-size:12px;border-radius:4px;padding:2px 7px;background:#eaf0e5;color:#426241}.basis.interpretation{background:#f4ead9;color:#8d6229}blockquote{margin:12px 0 4px;padding:8px 12px;border-left:2px solid #becab6;background:#f6f7f0;white-space:pre-wrap;overflow-wrap:anywhere}.column-label{font-size:13px;fill:#6d7e72}.edge path{stroke:#8b968f;stroke-width:1.8}.edge.interpretation path{stroke-dasharray:6 4}.node{cursor:pointer;outline:none}.node rect{fill:#f0f4e9;stroke:#aebfa2;stroke-width:1.3}.node[data-type="character"] rect{fill:#eef3f7;stroke:#aec3d2}.node[data-type="setting"] rect{fill:#f4eee3;stroke:#cbbb9c}.node[data-type="concept"] rect{fill:#f0eef8;stroke:#bfb4d5}.node[data-type="metaphor"] rect{fill:#f8eeed;stroke:#d6b6b0}.node:hover rect,.node:focus rect,.node.selected rect{stroke:#315c49;stroke-width:2.8}.node-name{font-size:13px;fill:#263b34}.node-id{font-size:10px;fill:#78837d}.uncertainties{padding:22px;margin-top:20px}.source{font-size:12px;color:#6b776f}noscript{display:block;padding:16px;background:#f4ead9}@media(max-width:850px){main{padding:20px 14px}.workspace{grid-template-columns:1fr}.detail{max-height:none}.graph{max-height:60vh}h1{font-size:24px}}
</style></head><body><main><p class="eyebrow">书籍知识资产 · 离线阅读</p><h1>${escapeHtml(asset.title)}</h1><p class="notice">${evidenceNotice}</p><p class="source">来源：${escapeHtml(asset.sourcePath)}</p>
<div class="toolbar"><label for="type-filter">按类型筛选</label><select id="type-filter"><option value="all">全部类型</option>${BOOK_ENTITY_TYPES.map((type) => `<option value="${type}">${typeLabels[type]}</option>`).join("")}</select></div><p id="network-status" class="muted" role="status" aria-live="polite"></p>
<div class="workspace"><section class="graph" aria-label="有向关系图"><svg id="network" role="group" aria-label="书籍资产关系图"></svg></section><aside id="node-detail" class="detail" aria-label="节点详情" aria-live="polite"></aside></div><section id="uncertainties" class="uncertainties"></section><noscript>请允许本地 JavaScript 以筛选关系图；也可以直接阅读同目录的 Markdown 卡片与 knowledge-network.json。</noscript></main>
<script id="book-data" type="application/json">${scriptJson(asset)}</script><script>(${offlineViewer.toString()})(${scriptJson(typeLabels)},${scriptJson(basisLabels)},${scriptJson(BOOK_ENTITY_TYPES)});</script></body></html>\n`;
}

export function renderBookKnowledgeFiles(asset) {
  const entityById = new Map(asset.entities.map((entity) => [entity.id, entity]));
  return {
    "book-report.md": renderReport(asset, entityById),
    "worldview.md": renderCards(asset, ["worldview"], "世界观", entityById),
    "characters.md": renderCards(asset, ["character"], "人物角色卡", entityById),
    "settings.md": renderCards(asset, ["setting"], "设定", entityById),
    "concepts-and-metaphors.md": renderCards(asset, ["concept", "metaphor"], "概念与隐喻", entityById),
    "knowledge-network.json": `${JSON.stringify(asset, null, 2)}\n`,
    "knowledge-network.html": renderNetworkHtml(asset),
  };
}
