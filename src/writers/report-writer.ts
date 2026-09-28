function listLines(items, formatter) {
  if (!items || items.length === 0) {
    return "- None\n";
  }
  return items.map((item) => `- ${formatter(item)}\n`).join("");
}

function countBy(items, field) {
  const counts = new Map();
  for (const item of items ?? []) {
    const key = item[field] ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function highValue(items) {
  return (items ?? []).filter((item) => item.reusePotential === "high");
}

export function buildReuseReportMarkdown(assetPackage) {
  const lines = ["# Reuse Report\n\n"];
  lines.push("## High Value Component Assets\n\n");
  lines.push(
    listLines(highValue(assetPackage.components), (component) => {
      return `${component.name} (${component.filePath})`;
    }),
  );
  lines.push("\n");

  if (assetPackage.componentSelection) {
    lines.push('## 组件方案取舍\n\n');
    lines.push(listLines(assetPackage.componentSelection, item => `${item.filePath} — ${item.decision === 'merge' ? '合并至 ' + item.canonicalFilePath : item.decision === 'context-only' ? '整页入口仅保留来源场景，不计为独立组件' : '不单独产出'}（${item.rule}）；源码及依赖保留。`));
    lines.push('\n');
  }
  lines.push("## 页面使用场景与辅助覆盖\n\n");
  lines.push(listLines(assetPackage.pages, page => `${page.name} — ${page.route} (${page.filePath})；${page.blocks.length} 处组件调用，${page.states.length} 处条件状态；交互需按实际场景验证。`));
  lines.push("\n");

  lines.push("## High Value Service Assets\n\n");
  lines.push(
    listLines(highValue(assetPackage.services), (service) => {
      return `${service.name} (${service.businessDomain}, ${service.filePath})`;
    }),
  );
  lines.push("\n");

  lines.push("## Business Flow Reuse Guidance\n\n");
  if (!assetPackage.businessPatterns || assetPackage.businessPatterns.length === 0) {
    lines.push("- None\n");
  } else {
    for (const pattern of assetPackage.businessPatterns) {
      lines.push(`### ${pattern.name}\n\n`);
      lines.push(listLines(pattern.guidance ?? [], (guidance) => guidance));
      lines.push("\n");
    }
  }

  lines.push("## Token Summary\n\n");
  const tokenCounts = countBy(assetPackage.tokens, "category");
  lines.push(listLines(tokenCounts, ([category, count]) => `${category}: ${count}`));
  lines.push("\n");

  lines.push("## Page Pattern Summary\n\n");
  lines.push(
    listLines(assetPackage.pagePatterns ?? [], (pattern) => {
      return `${pattern.name} (${pattern.pageType})`;
    }),
  );
  lines.push("\n");

  lines.push("## Risks And Deferred Work\n\n");
  lines.push("- Asset scores are heuristic and require human review before reuse.\n");
  lines.push("- Backend flows must be checked for auth, rate limit, and data boundary constraints.\n");
  lines.push("- Culture metaphor assets are deferred and must not store long copyrighted source text.\n\n");

  lines.push("## Next Extraction Suggestions\n\n");
  lines.push("- Promote high value components into a shared component catalog.\n");
  lines.push("- Review high value services for reusable API contracts and security constraints.\n");
  lines.push("- Use token and page pattern summaries to guide the next generated UI.\n");

  return lines.join("");
}
