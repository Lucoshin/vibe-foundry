import { extname, posix } from "node:path";
import { parse as parseJavaScript, parseExpression } from "@babel/parser";
import { NodeTypes, parse as parseVueTemplate } from "@vue/compiler-dom";
import { parse as parseVueSfc } from "@vue/compiler-sfc";
import postcss from "postcss";

const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "image"]);
const unitlessProperties = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow", "flexShrink", "order", "scale", "aspectRatio", "gridColumn", "gridRow", "fillOpacity", "strokeOpacity", "strokeWidth", "animationIterationCount", "gridArea", "strokeDashoffset"]);
const booleanAttributes = new Set(["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "selected"]);
const unknown = Symbol("unresolved value");
const pathOf = (path) => path.replaceAll("\\", "/");

function staticValue(node, bindings = new Map()) {
  if (!node) return unknown;
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) return node.value;
  if (node.type === "NullLiteral") return null;
  if (node.type === "Identifier") return bindings.has(node.name) ? bindings.get(node.name) : unknown;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral") return -node.argument.value;
  if (node.type === "MemberExpression" && !node.computed) {
    const object = staticValue(node.object, bindings);
    return object !== unknown && object !== null && Object.hasOwn(object, node.property.name) ? object[node.property.name] : unknown;
  }
  if (node.type === "ObjectExpression") {
    const value = {};
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty" || property.computed) return unknown;
      const resolved = staticValue(property.value, bindings);
      if (resolved === unknown) return unknown;
      value[property.key.name ?? property.key.value] = resolved;
    }
    return value;
  }
  return unknown;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "comments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

function targetNames(target) {
  if (!target) return [];
  if (target.type === "Identifier") return [target.name];
  if (target.type === "MemberExpression") return targetNames(target.object);
  if (target.type === "AssignmentPattern") return targetNames(target.left);
  if (target.type === "RestElement") return targetNames(target.argument);
  if (target.type === "ObjectPattern") return target.properties.flatMap((property) => targetNames(property.type === "RestElement" ? property.argument : property.value));
  if (target.type === "ArrayPattern") return target.elements.flatMap(targetNames);
  return [];
}

function invalidatedNames(tree, includeDeclarations) {
  const names = new Set();
  walk(tree, (entry) => {
    const target = entry.type === "AssignmentExpression" ? entry.left
      : entry.type === "UpdateExpression" ? entry.argument
      : includeDeclarations && entry.type === "VariableDeclarator" ? entry.id : null;
    if (!includeDeclarations && target?.type === "MemberExpression") return;
    for (const name of targetNames(target)) names.add(name);
  });
  return names;
}

function invalidateBindings(bindings, tree) {
  for (const name of invalidatedNames(tree, true)) bindings.delete(name);
}

function cssProperty(name) {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^ms-/, "-ms-");
}

function inlineStyle(value, react) {
  if (typeof value === "string") {
    const result = {};
    postcss.parse(`x{${value}}`).walkDecls((decl) => { result[decl.prop] = decl.value; });
    return result;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    result[cssProperty(name)] = typeof raw === "number" && react && raw !== 0 && !name.startsWith("--") && !unitlessProperties.has(name) ? `${raw}px` : String(raw);
  }
  return result;
}

function exportedRender(program, component) {
  const declarations = new Map();
  const exports = new Map();
  const assignedNames = invalidatedNames(program, false);
  for (const statement of program.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === "FunctionDeclaration" && declaration.id) declarations.set(declaration.id.name, declaration);
    if (declaration.type === "VariableDeclaration") {
      for (const item of declaration.declarations) if (item.id.type === "Identifier") declarations.set(item.id.name, item.init);
    }
    if (statement.type === "ExportDefaultDeclaration") exports.set("default", declaration);
    if (statement.type === "ExportNamedDeclaration" && !statement.source) {
      if (declaration.id?.name) exports.set(declaration.id.name, { type: "Identifier", name: declaration.id.name });
      for (const item of declaration.declarations ?? []) exports.set(item.id.name, { type: "Identifier", name: item.id.name });
      for (const item of statement.specifiers ?? []) exports.set(item.exported.name, { type: "Identifier", name: item.local.name });
    }
  }
  const name = component.exportMode === "default" ? "default" : component.exportName ?? component.name;
  let render = exports.get(name);
  const visited = new Set();
  while (render?.type === "Identifier" && !visited.has(render.name)) {
    if (assignedNames.has(render.name)) return null;
    visited.add(render.name);
    render = declarations.get(render.name);
  }
  if (render?.id && assignedNames.has(render.id.name)) return null;
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(render?.type) ? render : null;
}

function parameterBindings(render, scenario) {
  const bindings = new Map();
  const props = scenario?.props ?? {};
  const parameter = render.params[0];
  if (parameter?.type === "Identifier") bindings.set(parameter.name, props);
  if (parameter?.type === "ObjectPattern") {
    for (const property of parameter.properties) {
      if (property.type !== "ObjectProperty" || property.computed) continue;
      const key = property.key.name ?? property.key.value;
      const target = property.value.type === "AssignmentPattern" ? property.value.left : property.value;
      if (target.type !== "Identifier") continue;
      const value = Object.hasOwn(props, key) ? props[key] : property.value.type === "AssignmentPattern" ? staticValue(property.value.right) : unknown;
      if (value !== unknown) bindings.set(target.name, value);
    }
  }
  return bindings;
}

export function extractComponentDesignStructure(component, { materials, scenario }) {
  const sourceFile = pathOf(component.filePath);
  const source = materials.find((material) => pathOf(material.filePath) === sourceFile);
  const nodes = [];
  const styles = [];
  const unresolved = new Set();
  const descriptors = new Map();
  const externalStyles = new Map();
  const materialPaths = new Set(materials.map((material) => pathOf(material.filePath)));
  for (const material of materials) {
    const filePath = pathOf(material.filePath);
    const extension = extname(filePath).toLowerCase();
    if (extension === ".css") styles.push({ sourceFile: filePath, css: material.text });
    else if (extension === ".vue") {
      const parsed = parseVueSfc(material.text, { filename: filePath, templateParseOptions: { isVoidTag: (tag) => voidTags.has(tag) } });
      if (parsed.errors.length) {
        unresolved.add("部分组件结构无法静态识别，需要在实际页面核对。");
        continue;
      }
      descriptors.set(filePath, parsed.descriptor);
      for (const style of parsed.descriptor.styles) {
        if (style.lang && style.lang !== "css") unresolved.add("预处理样式需要编译后确认具体视觉参数。");
        else if (style.src) {
          const relativeSource = pathOf(style.src);
          const linkedPath = posix.normalize(posix.join(posix.dirname(filePath), relativeSource));
          if ((!relativeSource.startsWith("./") && !relativeSource.startsWith("../")) || linkedPath.startsWith("../") || !materialPaths.has(linkedPath)) {
            unresolved.add("外部样式来源无法按本地相对路径确认，需要核对。");
          } else {
            if (!externalStyles.has(linkedPath)) externalStyles.set(linkedPath, new Set());
            externalStyles.get(linkedPath).add(style.scoped ? filePath : null);
          }
        }
        else if (style.content.trim()) styles.push({ sourceFile: filePath, ...(style.scoped ? { ownerSourceFile: filePath } : {}), css: style.content });
      }
    } else if ([".scss", ".sass", ".less", ".styl", ".stylus"].includes(extension)) unresolved.add("预处理样式需要编译后确认具体视觉参数。");
  }
  for (let index = styles.length - 1; index >= 0; index -= 1) {
    const owners = externalStyles.get(styles[index].sourceFile);
    if (!owners) continue;
    const style = styles[index];
    styles.splice(index, 1, ...[...owners].map((ownerSourceFile) => ({ ...style, ...(ownerSourceFile ? { ownerSourceFile } : {}) })));
  }
  function newNode(tag, parentId, conditional) {
    const node = { id: nodes.length, parentId, tag, classes: [], attributes: {}, text: "", sourceFile, inlineStyle: {}, events: [], conditional };
    nodes.push(node);
    if (/^[A-Z]/.test(tag) || tag.includes("-")) unresolved.add("内部子组件的具体外观需要结合实际页面核对。");
    return node;
  }
  function applyAttribute(node, name, value, react) {
    if (value === false && booleanAttributes.has(name.toLowerCase())) { delete node.attributes[name]; return; }
    if (value === unknown) {
      unresolved.add(["class", "className", "style"].includes(name) ? "包含动态样式，具体状态外观需要核对。" : "部分内容或属性由运行时数据决定，需要核对。");
      return;
    }
    if (name === "class" || name === "className") {
      if (typeof value === "string") node.classes.push(...value.split(/\s+/).filter(Boolean));
      else unresolved.add("包含动态样式，具体状态外观需要核对。");
    } else if (name === "style") {
      const declarations = inlineStyle(value, react);
      if (declarations) Object.assign(node.inlineStyle, declarations);
      else unresolved.add("包含动态样式，具体状态外观需要核对。");
    } else if (["string", "boolean", "number"].includes(typeof value)) node.attributes[name] = String(value);
  }
  function discardSpreadAttributes(node) {
    node.classes = [];
    node.inlineStyle = {};
    node.attributes = {};
    node.events = [];
    unresolved.add("包含动态样式或属性，需要核对具体外观。");
  }
  function addText(parentId, text, conditional = false) {
    if (parentId === null || conditional && !nodes[parentId].conditional) return;
    if (typeof text === "string" || typeof text === "number") nodes[parentId].text += ` ${String(text)}`;
    else if (text === unknown) unresolved.add("部分文案由运行时数据决定，需要核对。");
  }
  if (!source) unresolved.add("缺少组件的结构依据，暂时无法描述具体效果。");
  else if (sourceFile.endsWith(".vue")) {
    const descriptor = descriptors.get(sourceFile);
    const bindings = new Map();
    for (const script of [descriptor?.scriptSetup, descriptor?.script].filter(Boolean)) {
      const ast = parseJavaScript(script.content, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
      if (ast.errors.length) {
        unresolved.add("脚本解析存在未确定项（如平台条件编译），动态内容需要在实际页面核对。");
        bindings.clear();
        break;
      }
      walk(ast.program, (entry) => {
        if (entry.type !== "CallExpression" || entry.callee.name !== "defineProps") return;
        const keys = entry.arguments[0]?.type === "ArrayExpression" ? entry.arguments[0].elements.map((item) => item.value) : entry.arguments[0]?.type === "ObjectExpression" ? entry.arguments[0].properties.map((item) => item.key?.name ?? item.key?.value) : [];
        for (const key of keys) if (Object.hasOwn(scenario?.props ?? {}, key)) bindings.set(key, scenario.props[key]);
      });
      invalidateBindings(bindings, ast.program);
    }
    const expressionValue = (text) => {
      try { return staticValue(parseExpression(text, { plugins: ["typescript"] }), bindings); }
      catch (error) { if (error instanceof SyntaxError) return unknown; throw error; }
    };
    function visit(entry, parentId = null, conditional = false) {
      if (entry.type === NodeTypes.TEXT) addText(parentId, entry.content, conditional);
      else if (entry.type === NodeTypes.INTERPOLATION) addText(parentId, expressionValue(entry.content.content), conditional);
      else if (entry.type === NodeTypes.ELEMENT) {
        const conditionalNode = conditional || entry.props.some((prop) => prop.type === NodeTypes.DIRECTIVE && ["if", "else", "else-if", "show", "for"].includes(prop.name));
        if (conditionalNode) unresolved.add("包含条件显示或重复内容，需要核对对应状态。");
        if (entry.tag === "template") { entry.children.forEach((child) => visit(child, parentId, conditionalNode)); return; }
        const node = newNode(entry.tag, parentId, conditionalNode);
        for (const prop of entry.props) {
          if (prop.type === NodeTypes.ATTRIBUTE) applyAttribute(node, prop.name, prop.value?.content ?? true, false);
          else if (prop.type === NodeTypes.DIRECTIVE && prop.name === "on" && prop.arg?.isStatic) node.events.push(prop.arg.content);
          else if (prop.type === NodeTypes.DIRECTIVE && prop.name === "bind") {
            if (prop.arg?.isStatic) applyAttribute(node, prop.arg.content, expressionValue(prop.exp?.content ?? ""), false);
            else discardSpreadAttributes(node);
          }
        }
        entry.children.forEach((child) => visit(child, node.id, conditionalNode));
      }
    }
    if (descriptor?.template && (!descriptor.template.lang || descriptor.template.lang === "html")) {
      const template = parseVueTemplate(descriptor.template.content, { isVoidTag: (tag) => voidTags.has(tag) });
      template.children.forEach((child) => visit(child));
    } else unresolved.add("模板需要编译后才能确认实际结构。");
  } else {
    const ast = parseJavaScript(source.text, { sourceType: "module", plugins: ["typescript", "jsx"] });
    const render = exportedRender(ast.program, component);
    if (!render) unresolved.add("组件的渲染结构无法静态确认，需要在实际页面核对。");
    else {
      const bindings = parameterBindings(render, scenario);
      invalidateBindings(bindings, render.body);
      function visit(entry, parentId = null, conditional = false, conditionalText = false) {
        if (!entry) return;
        if (entry.type === "JSXFragment") { entry.children.forEach((child) => visit(child, parentId, conditional, conditionalText)); return; }
        if (entry.type === "JSXText") { if (!conditionalText) addText(parentId, entry.value, conditional); return; }
        if (entry.type === "JSXExpressionContainer") { visit(entry.expression, parentId, conditional, conditionalText); return; }
        if (["ConditionalExpression", "LogicalExpression"].includes(entry.type)) {
          unresolved.add("包含条件显示或重复内容，需要核对对应状态。");
          if (entry.type === "ConditionalExpression") { visit(entry.consequent, parentId, true, true); visit(entry.alternate, parentId, true, true); }
          else visit(entry.right, parentId, true, true);
          return;
        }
        if (entry.type !== "JSXElement") { if (!conditionalText) addText(parentId, staticValue(entry, bindings), conditional); return; }
        const opening = entry.openingElement;
        if (opening.name.type !== "JSXIdentifier") { unresolved.add("内部子组件的具体外观需要结合实际页面核对。"); return; }
        const node = newNode(opening.name.name, parentId, conditional);
        for (const attribute of opening.attributes) {
          if (attribute.type !== "JSXAttribute") { discardSpreadAttributes(node); continue; }
          const name = attribute.name.name;
          if (typeof name !== "string") continue;
          if (/^on[A-Z]/.test(name)) { node.events.push(name.slice(2).toLowerCase()); continue; }
          const expression = attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute.value;
          applyAttribute(node, name, expression ? staticValue(expression, bindings) : true, true);
        }
        entry.children.forEach((child) => visit(child, node.id, conditional));
      }
      function returns(statement, conditional = false) {
        if (!statement) return false;
        if (statement.type === "ReturnStatement") { visit(statement.argument, null, conditional); return true; }
        if (statement.type === "BlockStatement") {
          for (const child of statement.body) if (returns(child, conditional)) return true;
        } else if (statement.type === "IfStatement") {
          unresolved.add("包含条件显示，需要核对对应状态。");
          const consequentReturns = returns(statement.consequent, true);
          const alternateReturns = returns(statement.alternate, true);
          return consequentReturns && alternateReturns;
        }
        return false;
      }
      if (render.body.type === "BlockStatement") returns(render.body);
      else visit(render.body);
    }
  }
  for (const node of nodes) node.text = node.text.replace(/\s+/g, " ").trim();
  if (nodes.length === 0) unresolved.add("尚未识别可确认的界面结构，需要补充实际效果参考。");
  return { nodes, styles, unresolved: [...unresolved].sort() };
}
