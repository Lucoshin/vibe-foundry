import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { listFiles } from "../utils/files.js";

const normalized = (path) => path.replaceAll("\\", "/");
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else if (child && typeof child === "object") walk(child, visit);
  }
}
function callsIn(node, name) {
  const calls = [];
  walk(node, (item) => {
    if (item.type === "CallExpression" && item.callee.type === "MemberExpression"
      && !item.callee.computed && item.callee.property.name === name) calls.push(item);
  });
  return calls;
}
const ast = (source) => parse(source, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] });

function bindsRequire(binding) {
  if (!binding) return false;
  if (binding.type === "Identifier") return binding.name === "require";
  if (binding.type === "RestElement") return bindsRequire(binding.argument);
  if (binding.type === "AssignmentPattern") return bindsRequire(binding.left);
  if (binding.type === "ArrayPattern") return binding.elements.some(bindsRequire);
  if (binding.type === "ObjectPattern") return binding.properties.some((item) => bindsRequire(item.type === "RestElement" ? item.argument : item.value));
  return false;
}

function hasLocalRequireBinding(tree) {
  let found = false;
  walk(tree, (node) => {
    if (bindsRequire(node.id) || bindsRequire(node.local) || bindsRequire(node.param) || node.params?.some(bindsRequire)) found = true;
  });
  return found;
}

// Deliberately restricted to the source-confirmed Vue CLI icons rule. Never execute its config.
export async function discoverWebpackSvgSprites(projectRoot, readSource, runtimeSources) {
  const config = await readSource("vue.config.js");
  if (!config.includes("svg-sprite-loader")) return null;
  const tree = ast(config);
  const rule = callsIn(tree, "options").find((call) => {
    const options = call.arguments[0];
    return options?.type === "ObjectExpression" && options.properties.length === 1
      && options.properties[0].key.name === "symbolId" && options.properties[0].value.value === "icon-[name]"
      && callsIn(call.callee.object, "loader").some((item) => item.arguments[0]?.value === "svg-sprite-loader")
      && callsIn(call.callee.object, "rule").some((item) => item.arguments[0]?.value === "icons")
      && callsIn(call.callee.object, "test").some((item) => item.arguments[0]?.type === "RegExpLiteral" && item.arguments[0].pattern === "\\.svg$" && !item.arguments[0].flags)
      && callsIn(call.callee.object, "add").some((item) => item.callee.object.type === "MemberExpression"
        && item.callee.object.property.name === "include" && item.arguments[0]?.callee?.name === "resolve"
        && item.arguments[0].arguments[0]?.value === "src/assets/icons");
  });
  if (!rule) return null;
  const main = await readSource("src/main.js");
  const hasEntry = ast(main).program.body.some((node) => node.type === "ImportDeclaration"
    && ["./assets/icons", "./assets/icons/index.js", "@/assets/icons", "@/assets/icons/index.js"].includes(node.source.value));
  if (!hasEntry) return null;
  const entry = "src/assets/icons/index.js";
  const source = await readSource(entry);
  const entryAst = ast(source);
  const hasRegistration = callsIn(entryAst, "component").some((call) => call.callee.object.name === "Vue"
    && call.arguments[0]?.value === "svg-icon" && call.arguments[1]?.name === "SvgIcon");
  const hasVue = entryAst.program.body.some((node) => node.type === "ImportDeclaration" && node.source.value === "vue" && node.specifiers.some((item) => item.type === "ImportDefaultSpecifier" && item.local.name === "Vue"));
  const hasComponent = entryAst.program.body.some((node) => node.type === "ImportDeclaration" && node.source.value === "@/components/SvgIcon" && node.specifiers.some((item) => item.type === "ImportDefaultSpecifier" && item.local.name === "SvgIcon"));
  if (!hasVue || !hasComponent || !hasRegistration) return null;
  const files = await listFiles(projectRoot, ["src/assets/icons"], [".svg"]);
  const digest = createHash("sha256").update(config).update(source);
  // Global registrations can pull helpers outside the component's own dependency closure.
  for (const item of runtimeSources) digest.update(item.filePath).update(item.source);
  for (const file of files) digest.update(file.filePath).update(await readFile(file.fullPath));
  return { entries: [entry], directory: "src/assets/icons", symbolId: "icon-[name]", fingerprint: digest.digest("hex") };
}

function within(root, path) {
  const part = relative(root, path);
  return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}

export function webpackContextPreviewPlugin(projectRoot, spriteConfig = null) {
  const root = resolve(projectRoot);
  const symbolPaths = new Map();
  let spriteCompiler;
  return {
    name: "vibehub-webpack-context",
    enforce: "pre",
    async transform(code, id) {
      const filePath = id.split("?")[0];
      if (!within(root, filePath) || normalized(filePath).includes("/node_modules/") || !/\.[cm]?[jt]sx?$/.test(filePath) || !code.includes("require.context")) return null;
      const tree = ast(code);
      const contexts = callsIn(tree, "context").filter((call) => call.callee.object.name === "require");
      if (!contexts.length) return null;
      if (hasLocalRequireBinding(tree)) throw new Error(`尚未支持存在局部 require 绑定的模块：${filePath}`);
      const imports = [];
      const edits = [];
      for (const [index, call] of contexts.entries()) {
        const [directory, recursive, pattern, mode] = call.arguments;
        const lazyVue = directory?.type === 'StringLiteral' && (directory.value.startsWith('.') || directory.value.startsWith('@/'))
          && recursive?.type === 'BooleanLiteral' && recursive.value === true
          && pattern?.type === 'RegExpLiteral' && pattern.pattern === '\\.vue$' && !pattern.flags
          && mode?.type === 'StringLiteral' && mode.value === 'lazy' && call.arguments.length === 4;
        if (lazyVue) {
          const canonicalRoot = await realpath(root);
          const directoryPath = await realpath(directory.value.startsWith('@/')
            ? resolve(root,'src',directory.value.slice(2)) : resolve(dirname(filePath),directory.value));
          if (!within(canonicalRoot,directoryPath)) throw new Error(`require.context 目录越出源工程：${filePath}`);
          const members=[];
          const pending=[directoryPath];
          while(pending.length) {
            const directoryEntry=pending.pop();
            this.addWatchFile(directoryEntry);
            for(const entry of await readdir(directoryEntry,{withFileTypes:true})) {
              const path=resolve(directoryEntry,entry.name);
              if(entry.isSymbolicLink()) throw new Error(`lazy Vue context 尚不支持符号链接：${path}`);
              if(entry.isDirectory()) pending.push(path);
              else if(entry.isFile() && entry.name.endsWith('.vue')) {
                this.addWatchFile(path);
                const key='./'+normalized(relative(directoryPath,path));
                members.push({key,code:`${JSON.stringify(key)}: () => import(${JSON.stringify(normalized(path))})`});
              }
            }
          }
          members.sort((left,right)=>left.key.localeCompare(right.key,'en'));
          const replacement=`(() => { const modules = {${members.map(item=>item.code).join(',')}}; const context = key => Object.hasOwn(modules,key) ? modules[key]() : Promise.reject(Object.assign(new Error("Cannot find module " + key), {code:"MODULE_NOT_FOUND"})); context.keys = () => Object.keys(modules); return context; })()`;
          edits.push({start:call.start,end:call.end,replacement});
          continue;
        }
        if (directory?.type !== "StringLiteral" || !directory.value.startsWith(".") || recursive?.type !== "BooleanLiteral"
          || pattern?.type !== "RegExpLiteral" || pattern.flags.includes("g") || pattern.flags.includes("y")
          || call.arguments.length > 4 || (mode && (mode.type !== "StringLiteral" || mode.value !== "sync"))) {
          throw new Error(`尚未支持此 require.context 参数（仅支持静态相对目录、递归布尔值、非状态正则和 sync 模式）：${filePath}`);
        }
        if (recursive.value) throw new Error(`图标 require.context 仅支持非递归目录：${filePath}`);
        if (pattern.pattern !== "\\.svg$" || pattern.flags) throw new Error(`require.context 仅支持已确认规则的 SVG 匹配表达式：${filePath}`);
        const directoryPath = await realpath(resolve(dirname(filePath), directory.value));
        if (!within(await realpath(root), directoryPath)) throw new Error(`require.context 目录越出源工程：${filePath}`);
        if (!spriteConfig || !within(resolve(await realpath(root), spriteConfig.directory), directoryPath)) {
          throw new Error(`require.context 的 SVG loader 语义尚未确认：${filePath}`);
        }
        const matcher = new RegExp(pattern.pattern, pattern.flags);
        const matched = [];
        for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
          if (entry.isFile()) {
            const path = resolve(directoryPath, entry.name);
            const key = "./" + entry.name;
            if (matcher.test(key)) matched.push({ key, path });
          }
        }
        matched.sort((a, b) => a.key.localeCompare(b.key, "en"));
        const members = [];
        for (const [offset, match] of matched.entries()) {
          const symbolId = spriteConfig.symbolId.replace("[name]", basename(match.path, ".svg"));
          const previous = symbolPaths.get(symbolId);
          if (previous && previous !== match.path) throw new Error(`重复的 SVG symbol ${symbolId}：${previous}、${match.path}`);
          symbolPaths.set(symbolId, match.path);
          const request = normalized(match.path) + "?vibehub-svg-symbol";
          const name = `__vibehub_context_${index}_${offset}`;
          imports.push(`import * as ${name} from ${JSON.stringify(request)};`);
          members.push(`${JSON.stringify(match.key)}: ${name}`);
          this.addWatchFile(match.path);
        }
        const replacement = `(() => { const modules = {${members.join(",")}}; const context = key => { if (!Object.hasOwn(modules, key)) throw new Error("Cannot find module " + key); return modules[key]; }; context.keys = () => Object.keys(modules); return context; })()`;
        edits.push({ start: call.start, end: call.end, replacement });
      }
      if (!edits.length) return null;
      for (const edit of edits.reverse()) code = code.slice(0, edit.start) + edit.replacement + code.slice(edit.end);
      return { code: imports.join("\n") + "\n" + code, map: null };
    },
    async load(id) {
      if (!id.endsWith("?vibehub-svg-symbol")) return null;
      const path = await realpath(id.slice(0, -"?vibehub-svg-symbol".length));
      if (!spriteConfig || !within(resolve(await realpath(root), spriteConfig.directory), path)) throw new Error("SVG sprite 源路径不在已确认规则内");
      if (!spriteCompiler) {
        const requireProject = createRequire(resolve(root, "package.json"));
        const requireLoader = createRequire(requireProject.resolve("svg-sprite-loader"));
        const Compiler = requireLoader("svg-baker");
        spriteCompiler = new Compiler();
      }
      const symbolId = spriteConfig.symbolId.replace("[name]", basename(path, ".svg"));
      const symbol = await spriteCompiler.addSymbol({ id: symbolId, content: await readFile(path, "utf8"), path });
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbol.render()}</svg>`;
      return `const id = ${JSON.stringify(symbolId)}; if (!document.getElementById(id)) document.body.insertAdjacentHTML("afterbegin", ${JSON.stringify(markup)}); export default { id, viewBox: ${JSON.stringify(symbol.viewBox)} };`;
    },
  };
}
