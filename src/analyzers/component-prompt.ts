import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

import { parse as parseJavaScript } from "@babel/parser";
import { NodeTypes, parse as parseVueTemplate } from "@vue/compiler-dom";
import { parse as parseVueSfc } from "@vue/compiler-sfc";

import { canonicalSerialize } from "../preview/preview-action.js";
import { buildComponentDesignDescription } from "./component-design-description.js";

const textExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".vue", ".css", ".scss", ".sass", ".less", ".styl", ".stylus", ".svg", ".json"]);
const styleExtensions = new Set([".css", ".scss", ".sass", ".less", ".styl", ".stylus"]);
const sourceExtensions = [".js", ".jsx", ".ts", ".tsx", ".vue"];
const resourceExtensions = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".ico", ".bmp", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".mp3", ".ogg", ".wav"]);
const resourceTags = new Set(["img", "image", "source", "video", "audio", "track", "use", "embed"]);
const resourceAttributes = new Set(["src", "href", "xlinkHref", "poster", "srcSet", "srcset"]);
const vueVoidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "image"]);

function normalizePath(value) {
  return String(value).replaceAll("\\", "/");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments", "tokens", "errors"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

function styleReferences(text) {
  const references = [];
  function quoted(start) {
    const quote = text[start];
    let end = start + 1;
    while (end < text.length) {
      if (text[end] === "\\") { end += 2; continue; }
      if (text[end] === quote) return { source: text.slice(start + 1, end), end: end + 1 };
      end += 1;
    }
    return { source: "", end };
  }
  for (let index = 0; index < text.length;) {
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    if (text[index] === '"' || text[index] === "'") { index = quoted(index).end; continue; }
    const rule = text.slice(index).match(/^@(import|use|forward)\b\s*/i);
    if (rule) {
      index += rule[0].length;
      if (text[index] === '"' || text[index] === "'") {
        const value = quoted(index);
        references.push({ source: value.source });
        index = value.end;
      }
      continue;
    }
    const url = text.slice(index).match(/^url\s*\(\s*/i);
    if (url) {
      index += url[0].length;
      if (text[index] === '"' || text[index] === "'") {
        const value = quoted(index);
        references.push({ source: value.source });
        index = value.end;
      } else {
        const end = text.indexOf(")", index);
        if (end < 0) break;
        references.push({ source: text.slice(index, end).trim() });
        index = end + 1;
      }
      continue;
    }
    index += 1;
  }
  return references;
}

function sourceReferences(filePath, sourceText, indexedFile) {
  const extension = extname(filePath).toLowerCase();
  const references = [];
  const dynamic = [];
  const addResource = (name, value) => {
    if (name.toLowerCase() !== "srcset") { references.push({ source: value }); return; }
    const candidates = value.split(",").map((item) => item.trim().split(/\s+/));
    if (value.includes("data:") || candidates.some((item) => !item[0] || item.length > 2 || (item[1] && !/^(?:\d+(?:\.\d+)?x|\d+w)$/.test(item[1])))) {
      dynamic.push(`${name}（资源候选列表无法静态解析）`);
      return;
    }
    candidates.forEach(([source]) => references.push({ source }));
  };
  const importedNames = new Set((indexedFile?.imports ?? []).map((item) => item.localName));
  const inspectScript = (script, typescript) => {
    const ast = parseJavaScript(script, { sourceType: "module", plugins: typescript ? ["jsx", "typescript"] : ["jsx"], errorRecovery: true });
    for (const statement of ast.program.body) {
      if (statement.type === "ImportDeclaration") {
        statement.specifiers.forEach((specifier) => importedNames.add(specifier.local.name));
      }
    }
    walk(ast.program, (node) => {
      if (!indexedFile && ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) && node.source) {
        references.push({ source: node.source.value, module: true });
      }
      if (node.type === "JSXOpeningElement" && resourceTags.has(node.name?.name)) {
        for (const attribute of node.attributes ?? []) {
          if (attribute.type !== "JSXAttribute" || !resourceAttributes.has(attribute.name?.name)) continue;
          const value = attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute.value;
          if (value?.type === "StringLiteral") addResource(attribute.name.name, value.value);
          else if (value?.type !== "Identifier" || !importedNames.has(value.name)) dynamic.push(`${attribute.name.name}（行 ${node.loc.start.line}）`);
        }
      }
      if (node.type === "NewExpression" && node.callee?.name === "URL"
        && node.arguments[1]?.type === "MemberExpression" && node.arguments[1].object?.type === "MetaProperty"
        && node.arguments[1].property?.name === "url") {
        if (node.arguments[0]?.type === "StringLiteral") references.push({ source: node.arguments[0].value });
        else dynamic.push(`new URL（行 ${node.loc.start.line}）`);
      }
    });
  };
  const inspectTemplate = (template) => {
    const ast = parseVueTemplate(template, { isVoidTag: (tag) => vueVoidTags.has(tag) });
    const visit = (node) => {
      if (node.type === NodeTypes.ELEMENT && resourceTags.has(node.tag)) {
        for (const property of node.props) {
          if (property.type === NodeTypes.ATTRIBUTE && resourceAttributes.has(property.name)) addResource(property.name, property.value?.content ?? "");
          if (property.type === NodeTypes.DIRECTIVE && property.name === "bind" && resourceAttributes.has(property.arg?.content)) {
            const content = property.exp?.content ?? "";
            if (/^(['"])[\s\S]*\1$/.test(content)) addResource(property.arg.content, content.slice(1, -1));
            else if (!importedNames.has(content)) dynamic.push(`${property.arg.content}（模板行 ${node.loc.start.line}）`);
          }
        }
      }
      (node.children ?? []).forEach(visit);
    };
    visit(ast);
  };
  if (sourceExtensions.includes(extension) && extension !== ".vue") inspectScript(sourceText, [".ts", ".tsx"].includes(extension));
  if (extension === ".vue") {
    const { descriptor, errors } = parseVueSfc(sourceText, { filename: filePath, templateParseOptions: { isVoidTag: (tag) => vueVoidTags.has(tag) } });
    if (errors.length) throw new Error(`Unable to parse component material: ${filePath}`);
    if (descriptor.template) inspectTemplate(descriptor.template.content);
    for (const style of descriptor.styles) {
      if (style.src) references.push({ source: style.src });
      references.push(...styleReferences(style.content));
    }
    for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) inspectScript(script.content, script.lang === "ts");
  }
  if (extension === ".svg") inspectTemplate(sourceText.replace(/<\?xml\b[\s\S]*?\?>/gi, "").replace(/<!DOCTYPE(?:[^>"']|"[^"]*"|'[^']*')*>/gi, ""));
  if (styleExtensions.has(extension)) references.push(...styleReferences(sourceText));
  return { references, dynamic };
}

export async function buildComponentPrompts(projectRoot, components, { sourceIndex, runtimeContext = {}, tokens = [] }) {
  const resolvedRoot = await realpath(resolve(projectRoot));
  const indexedFiles = new Map(sourceIndex.files.map((file) => [normalizePath(file.filePath), file]));
  const materialCache = new Map();
  const referenceCache = new Map();
  async function material(filePath) {
    const normalized = normalizePath(filePath);
    if (!materialCache.has(normalized)) materialCache.set(normalized, (async () => {
      const fullPath = resolve(resolvedRoot, normalized);
      const within = (path) => {
        const rel = relative(resolvedRoot, path);
        return rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel);
      };
      if (!within(fullPath)) throw Object.assign(new Error(`来源超出项目目录：${normalized}`), { code: "COMPONENT_MATERIAL_OUTSIDE" });
      const actualPath = await realpath(fullPath);
      if (!within(actualPath)) throw Object.assign(new Error(`来源链接超出项目目录：${normalized}`), { code: "COMPONENT_MATERIAL_OUTSIDE" });
      const indexed = indexedFiles.get(normalized);
      const bytes = indexed ? Buffer.from(indexed.sourceText, "utf8") : await readFile(fullPath);
      return { filePath: normalized, digest: digest(bytes), bytes: bytes.length, text: textExtensions.has(extname(normalized).toLowerCase()) ? bytes.toString("utf8") : null };
    })());
    return materialCache.get(normalized);
  }
  async function resolveReference(from, source) {
    if (!source || source.startsWith("#") || source.startsWith("data:")) return { ignored: true };
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) return { unresolved: `外部资源未携带：${from} → ${source}` };
    if (source.startsWith("/") || source.includes("${") || source.includes("#{") || source.includes("\\")) return { unresolved: `未解析资源路径：${from} → ${source}` };
    const raw = source.split(/[?#]/)[0];
    const base = normalizePath(relative(resolvedRoot, resolve(resolvedRoot, dirname(from), raw)));
    const candidates = extname(base) ? [base] : [...sourceExtensions.map((extension) => `${base}${extension}`), ...sourceExtensions.map((extension) => `${base}/index${extension}`)];
    const matches = [];
    for (const candidate of candidates) {
      try { await material(candidate); matches.push(candidate); } catch (error) {
        if (error?.code === "COMPONENT_MATERIAL_OUTSIDE") return { unresolved: error.message };
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return matches.length === 1 ? { filePath: matches[0] } : { unresolved: `未解析来源：${from} → ${source}${matches.length > 1 ? "（多个实际文件）" : ""}` };
  }
  const records = [];
  for (const component of components) {
    const selected = component.primaryScenarioId
      ? component.scenarios.find((scenario) => scenario.id === component.primaryScenarioId)
      : component.previewScenario;
    const included = new Map();
    const attachments = new Map();
    const unresolved = new Set((runtimeContext.unresolved ?? []).map((item) => `未还原运行上下文：${item}`));
    for (const prop of selected?.unresolvedProps ?? []) unresolved.add(`未解析调用参数：${prop}`);
    for (const slot of selected?.unresolvedSlots ?? []) unresolved.add(`未解析调用插槽：${slot}`);
    if (!selected) unresolved.add("缺少真实调用样例；不生成虚构 props、插槽或业务状态。");
    const pending = [{ filePath: "package.json", followModules: false }];
    if (selected?.sourceFile) pending.push({ filePath: selected.sourceFile, followModules: false });
    for (const filePath of runtimeContext.globalStyles ?? []) pending.push({ filePath, followModules: true });
    pending.push({ filePath: component.filePath, followModules: true });
    const visited = new Map();
    const omittedScenarioDependencies = [];
    const isStyleOrResource = (filePath) => {
      const extension = extname(filePath.split(/[?#]/)[0]).toLowerCase();
      return styleExtensions.has(extension) || resourceExtensions.has(extension);
    };
    while (pending.length) {
      const next = pending.pop();
      const filePath = normalizePath(next.filePath);
      if (visited.get(filePath) === true || (visited.has(filePath) && !next.followModules)) continue;
      visited.set(filePath, next.followModules);
      let value;
      try { value = await material(filePath); } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "COMPONENT_MATERIAL_OUTSIDE") throw error;
        unresolved.add(error?.code === "ENOENT" ? `来源文件缺失：${filePath}` : error.message);
        continue;
      }
      if (value.text === null) {
        attachments.set(filePath, { filePath, bytes: value.bytes, sha256: value.digest });
        unresolved.add(`需要原件附件：${filePath}（二进制文件未嵌入提示词）`);
        continue;
      }
      included.set(filePath, value);
      if (!referenceCache.has(filePath)) referenceCache.set(filePath, sourceReferences(filePath, value.text, indexedFiles.get(filePath)));
      const { references: parsedReferences, dynamic } = referenceCache.get(filePath);
      const references = [...parsedReferences];
      dynamic.forEach((item) => unresolved.add(`动态资源未解析：${filePath} → ${item}`));
      for (const dependency of indexedFiles.get(filePath)?.dependencies ?? []) {
        if (!next.followModules && !isStyleOrResource(dependency.resolvedFilePath || dependency.source)) {
          omittedScenarioDependencies.push({ sourceFile: filePath, ...dependency });
          continue;
        }
        if (dependency.resolvedFilePath) pending.push({ filePath: dependency.resolvedFilePath, followModules: true });
        else if (dependency.source.startsWith(".")) references.push({ source: dependency.source });
        else unresolved.add(`外部依赖或别名未解析：${filePath} → ${dependency.source}`);
      }
      for (const reference of references) {
        if (reference.module && !next.followModules && !isStyleOrResource(reference.source)) {
          omittedScenarioDependencies.push({ sourceFile: filePath, source: reference.source, resolvedFilePath: "" });
          continue;
        }
        if (reference.module && !reference.source.startsWith(".")) {
          unresolved.add(`外部依赖或别名未解析：${filePath} → ${reference.source}`);
          continue;
        }
        const result = await resolveReference(filePath, reference.source);
        if (result.filePath) pending.push({ filePath: result.filePath, followModules: true });
        if (result.unresolved) unresolved.add(result.unresolved);
      }
    }
    for (const dependency of omittedScenarioDependencies) {
      if (!included.has(dependency.resolvedFilePath) && !attachments.has(dependency.resolvedFilePath)) {
        unresolved.add(`场景依赖未携带，需核对：${dependency.sourceFile} → ${dependency.source}`);
      }
    }
    for (const filePath of runtimeContext.sourceFiles ?? []) {
      if (included.has(filePath)) continue;
      try {
        const value = await material(filePath);
        if (value.text !== null) included.set(filePath, value);
        unresolved.add(`项目上下文证据仅携带本文件，需核对其初始化依赖：${filePath}`);
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "COMPONENT_MATERIAL_OUTSIDE") throw error;
        unresolved.add(error?.code === "ENOENT" ? `上下文来源缺失：${filePath}` : error.message);
      }
    }
    const sourceFiles = [...included.keys()].sort();
    const description = buildComponentDesignDescription(component, {
      materials: sourceFiles.map((filePath) => included.get(filePath)),
      scenario: selected,
    });
    for (const item of description.unresolved) unresolved.add(item);
    const metadata = {
      componentName: component.name, filePath: normalizePath(component.filePath),
      exportMode: component.exportMode, exportName: component.exportName, componentType: component.componentType,
      platformRuntime: component.platformRuntime, platformComponents: component.platformComponents,
      selectedScenario: selected ?? null,
      previewRuntimeContext: {
        providers: runtimeContext.providers ?? [], plugins: runtimeContext.plugins ?? [],
        globalStyles: runtimeContext.globalStyles ?? [], environmentVariables: runtimeContext.environmentVariables ?? [],
      },
      tokens: tokens.filter((token) => token.sourceFiles?.some((filePath) => included.has(filePath))),
      unresolved: [...unresolved].sort(),
    };
    const materialDigests = [
      ...[...included.values()].map(({ filePath, digest, bytes }) => ({ filePath, digest, bytes })),
      ...[...attachments.values()].map(({ filePath, sha256, bytes }) => ({ filePath, digest: sha256, bytes })),
    ].sort((left, right) => left.filePath.localeCompare(right.filePath));
    const sourceDigest = digest(canonicalSerialize(JSON.parse(JSON.stringify({
      contract: "component-effect-prompt-v2",
      materials: materialDigests,
      metadata,
      prompt: description.prompt,
    }))));
    records.push({ schemaVersion: "0.2.0", componentName: component.name, filePath: normalizePath(component.filePath), sourceDigest, sourceFiles, unresolved: metadata.unresolved, prompt: description.prompt });
  }
  return records;
}
