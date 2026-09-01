import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import { parse as parseJavaScript } from "@babel/parser";
import { NodeTypes, parse as parseVueTemplate } from "@vue/compiler-dom";
import { parse as parseVueSfc } from "@vue/compiler-sfc";

import { listFiles, readTextFile } from "../utils/files.js";

const sourceExtensions = [".js", ".jsx", ".ts", ".tsx", ".vue"];
const vueVoidTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
  "image",
]);

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveImport(projectRoot, importerPath, source) {
  const aliasedSource = source.startsWith("@/") ? `src/${source.slice(2)}` : "";
  if (!source.startsWith(".") && !aliasedSource) {
    return "";
  }
  const basePath = aliasedSource
    ? resolve(projectRoot, aliasedSource)
    : resolve(projectRoot, dirname(importerPath), source);
  const candidates = extname(basePath)
    ? [basePath]
    : [
        ...sourceExtensions.map((extension) => `${basePath}${extension}`),
        ...sourceExtensions.map((extension) => join(basePath, `index${extension}`)),
      ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return relative(projectRoot, candidate).replaceAll("\\", "/");
    }
  }
  return "";
}

function walkJavaScript(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (typeof node.type === "string") {
    visitor(node);
  }
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) walkJavaScript(item, visitor);
    } else if (value && typeof value === "object") {
      walkJavaScript(value, visitor);
    }
  }
}

function staticJavaScriptValue(node) {
  if (!node) return { resolved: false };
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) {
    return { resolved: true, value: node.value };
  }
  if (node.type === "NullLiteral") return { resolved: true, value: null };
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument?.type === "NumericLiteral") {
    return { resolved: true, value: -node.argument.value };
  }
  if (node.type === "ArrayExpression") {
    const items = node.elements.map(staticJavaScriptValue);
    return items.every((item) => item.resolved)
      ? { resolved: true, value: items.map((item) => item.value) }
      : { resolved: false };
  }
  if (node.type === "ObjectExpression") {
    const entries = [];
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty" || property.computed) return { resolved: false };
      const key = property.key.name ?? property.key.value;
      const item = staticJavaScriptValue(property.value);
      if (typeof key !== "string" || !item.resolved) return { resolved: false };
      entries.push([key, item.value]);
    }
    return { resolved: true, value: Object.fromEntries(entries) };
  }
  return { resolved: false };
}

function jsxName(node) {
  return node?.type === "JSXIdentifier" ? node.name : "";
}

function jsxSlotInfo(children = []) {
  const text = children
    .filter((child) => child.type === "JSXText")
    .map((child) => child.value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const unresolvedSlots = children.some((child) =>
    child.type === "JSXElement"
    || child.type === "JSXFragment"
    || (child.type === "JSXExpressionContainer" && child.expression?.type !== "JSXEmptyExpression"),
  ) ? ["default"] : [];
  return { slots: text ? { default: text } : {}, unresolvedSlots };
}

function jsxComponentCall(node) {
  const localName = jsxName(node.openingElement?.name);
  if (!/^[A-Z]/.test(localName)) return null;
  const attributes = [];
  const events = [];
  for (const attribute of node.openingElement.attributes ?? []) {
    if (attribute.type === "JSXSpreadAttribute") {
      attributes.push({ name: `spread:${attribute.argument?.name ?? "expression"}`, dynamic: true });
      continue;
    }
    const name = jsxName(attribute.name);
    if (!name) continue;
    if (/^on[A-Z]/.test(name)) {
      events.push(name);
      continue;
    }
    if (!attribute.value) {
      attributes.push({ name, value: true });
      continue;
    }
    if (attribute.value.type === "StringLiteral") {
      attributes.push({ name, value: attribute.value.value });
      continue;
    }
    const result = staticJavaScriptValue(attribute.value.expression);
    attributes.push(result.resolved ? { name, value: result.value } : { name, dynamic: true });
  }
  const slotInfo = jsxSlotInfo(node.children);
  return {
    localName,
    attributes,
    events: [...new Set(events)].sort(),
    ...slotInfo,
    sourceLocation: {
      line: node.loc?.start.line ?? 0,
      column: node.loc?.start.column ?? 0,
    },
  };
}

function parseJavaScriptSource(sourceText, filePath, options = {}) {
  const plugins = ["jsx"];
  if ([".ts", ".tsx"].includes(extname(filePath)) || options.typescript) plugins.push("typescript");
  const ast = parseJavaScript(sourceText, {
    sourceType: "module",
    plugins,
    errorRecovery: true,
  });
  const imports = [];
  const exports = [];
  const componentCalls = [];
  walkJavaScript(ast.program, (node) => {
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) {
        imports.push({
          localName: specifier.local.name,
          importedName: specifier.type === "ImportDefaultSpecifier"
            ? "default"
            : specifier.imported?.name ?? "*",
          source: node.source.value,
        });
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exports.push({ exportedName: "default", localName: node.declaration?.id?.name ?? "default" });
    } else if (node.type === "ExportNamedDeclaration") {
      if (node.declaration?.id?.name) {
        exports.push({ exportedName: node.declaration.id.name, localName: node.declaration.id.name });
      }
      for (const specifier of node.specifiers ?? []) {
        exports.push({ exportedName: specifier.exported.name, localName: specifier.local.name });
      }
    } else if (node.type === "JSXElement") {
      const call = jsxComponentCall(node);
      if (call) componentCalls.push(call);
    }
  });
  return { imports, exports, componentCalls };
}

function vueStaticArgument(argument) {
  return argument?.type === NodeTypes.SIMPLE_EXPRESSION && argument.isStatic ? argument.content : "";
}

function staticVueExpression(content) {
  try {
    const ast = parseJavaScript(`(${content})`, { sourceType: "module", plugins: ["typescript"] });
    return staticJavaScriptValue(ast.program.body[0]?.expression);
  } catch {
    return { resolved: false };
  }
}

function vueSlotInfo(children = []) {
  const text = children
    .filter((child) => child.type === NodeTypes.TEXT)
    .map((child) => child.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const unresolvedSlots = children.some((child) =>
    child.type === NodeTypes.ELEMENT || child.type === NodeTypes.INTERPOLATION,
  ) ? ["default"] : [];
  return { slots: text ? { default: text } : {}, unresolvedSlots };
}

function vueComponentCalls(template) {
  if (!template.trim()) return [];
  const ast = parseVueTemplate(template, {
    comments: false,
    isVoidTag: (tag) => vueVoidTags.has(tag),
  });
  const calls = [];
  const visit = (node) => {
    if (node.type === NodeTypes.ELEMENT) {
      const localName = node.tag;
      if (node.tagType === 1) {
        const attributes = [];
        const events = [];
        for (const property of node.props) {
          if (property.type === NodeTypes.ATTRIBUTE) {
            attributes.push({ name: property.name, value: property.value?.content ?? true });
          } else if (property.type === NodeTypes.DIRECTIVE) {
            const name = vueStaticArgument(property.arg);
            if (property.name === "on") {
              if (name) events.push(name);
            } else if (property.name === "bind" && name) {
              const result = staticVueExpression(property.exp?.content ?? "");
              attributes.push(result.resolved ? { name, value: result.value } : { name, dynamic: true });
            } else if (property.name === "bind" && !property.arg && property.exp) {
              attributes.push({ name: `spread:${property.exp.content}`, dynamic: true });
            }
          }
        }
        const slotInfo = vueSlotInfo(node.children);
        calls.push({
          localName,
          attributes,
          events: [...new Set(events)].sort(),
          ...slotInfo,
          sourceLocation: {
            line: node.loc.start.line,
            column: node.loc.start.column,
          },
        });
      }
      for (const child of node.children ?? []) visit(child);
    } else {
      for (const child of node.children ?? []) visit(child);
    }
  };
  visit(ast);
  return calls;
}

function parseVueSource(sourceText, filePath) {
  const { descriptor } = parseVueSfc(sourceText, { filename: filePath });
  const script = descriptor.scriptSetup ?? descriptor.script;
  const scriptIndex = script
    ? parseJavaScriptSource(script.content, filePath, { typescript: script.lang === "ts" })
    : { imports: [], exports: [], componentCalls: [] };
  return {
    imports: scriptIndex.imports,
    exports: scriptIndex.exports,
    componentCalls: vueComponentCalls(descriptor.template?.content ?? ""),
    styles: descriptor.styles.map((style) => ({ lang: style.lang ?? "css", scoped: style.scoped })),
  };
}

async function indexFile(projectRoot, file) {
  const sourceText = await readTextFile(file.fullPath);
  const parsed = file.filePath.endsWith(".vue")
    ? parseVueSource(sourceText, file.filePath)
    : parseJavaScriptSource(sourceText, file.filePath);
  const imports = await Promise.all(parsed.imports.map(async (item) => ({
    ...item,
    resolvedFilePath: await resolveImport(projectRoot, file.filePath, item.source),
  })));
  return {
    filePath: file.filePath,
    sourceFingerprint: createHash("sha256").update(sourceText).digest("hex"),
    imports,
    exports: parsed.exports,
    componentCalls: parsed.componentCalls,
    styles: parsed.styles ?? [],
  };
}

export async function buildFrontendSourceIndex(projectRoot, sourceDirs = ["src"]) {
  const files = await listFiles(projectRoot, sourceDirs, sourceExtensions);
  return {
    schemaVersion: "0.1.0",
    files: await Promise.all(files.map((file) => indexFile(projectRoot, file))),
  };
}
