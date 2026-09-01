import { parse as parseJavaScript } from "@babel/parser";
import { NodeTypes, parse as parseVueTemplate } from "@vue/compiler-dom";
import { parse as parseVueSfc } from "@vue/compiler-sfc";

const pageTypes = [
  ["login", /login|signin|sign-in/i],
  ["dashboard", /dashboard|overview/i],
  ["table", /table|list/i],
  ["detail", /detail|details|\[id\]/i],
  ["settings", /settings|preferences/i],
];

const regionRules = [
  ["navigation", /^(?:header|nav)$|Nav|Header/],
  ["search", /Search/],
  ["filter", /Filter/],
  ["list", /List|Table|Grid/],
  ["empty-state", /Empty/],
  ["form", /^(?:form)$|Form|Editor/],
  ["overlay", /Modal|Dialog|Drawer|Popup|Overlay/],
  ["bottom-action", /^(?:footer)$|Bottom.*Action|ActionBar|Submit/],
];
const vueVoidTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
  "image",
]);

function pageTypeFor(filePath) {
  const match = pageTypes.find(([, pattern]) => pattern.test(filePath));
  return match ? match[0] : "generic";
}

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visitor));
    else if (value && typeof value === "object") walk(value, visitor);
  }
}

function reactElementNames(sourceText, filePath) {
  const ast = parseJavaScript(sourceText, {
    sourceType: "module",
    plugins: ["jsx", ...(filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? ["typescript"] : [])],
    errorRecovery: true,
  });
  const names = [];
  walk(ast.program, (node) => {
    if (node.type === "JSXOpeningElement" && node.name?.type === "JSXIdentifier") names.push(node.name.name);
  });
  return names;
}

function vueElementNames(sourceText, filePath) {
  const { descriptor } = parseVueSfc(sourceText, { filename: filePath });
  if (!descriptor.template?.content) return [];
  const ast = parseVueTemplate(descriptor.template.content, {
    isVoidTag: (tag) => vueVoidTags.has(tag),
  });
  const names = [];
  walk(ast, (node) => {
    if (node.type === NodeTypes.ELEMENT) names.push(node.tag);
  });
  return names;
}

function regionsFor(sourceText, filePath) {
  if (!sourceText) return [];
  let names;
  try {
    names = filePath.endsWith(".vue")
      ? vueElementNames(sourceText, filePath)
      : reactElementNames(sourceText, filePath);
  } catch {
    return [];
  }
  return regionRules
    .filter(([, pattern]) => names.some((name) => pattern.test(name)))
    .map(([region]) => region);
}

export function summarizePagePatterns(pageFiles) {
  return pageFiles
    .map((pageFile) => {
      const filePath = typeof pageFile === "string" ? pageFile : pageFile.filePath;
      const pageType = pageTypeFor(filePath);
      const regions = regionsFor(typeof pageFile === "string" ? "" : pageFile.sourceText, filePath);
      return {
        name: `${pageType} page`,
        kind: "page-pattern",
        pageType,
        sourceFiles: [filePath],
        ...(regions.length > 0 ? { regions } : {}),
      };
    });
}
