import postcss from "postcss";
import { extractComponentDesignStructure } from "./component-design-structure.js";

const stateNames = { hover: "悬停时", focus: "获得焦点时", "focus-visible": "获得键盘焦点时", active: "按下时", disabled: "禁用时", checked: "选中时" };
const colorNames = { white: "白色", black: "黑色", red: "红色", blue: "蓝色", green: "绿色", transparent: "透明", currentcolor: "沿用当前文字颜色" };
const propertyNames = { transform: "变换", opacity: "不透明度", "background-color": "背景颜色", background: "背景", "border-color": "描边颜色", "box-shadow": "投影", color: "文字颜色", width: "宽度", height: "高度", all: "所有可过渡属性" };
const easingNames = { ease: "先加速后减速", linear: "匀速", "ease-in": "逐渐加速", "ease-out": "逐渐减速", "ease-in-out": "缓入缓出" };
const sections = ["布局", "视觉", "动效", "交互"];
const present = (value) => value !== undefined && value !== false && value !== "false" && value !== null;
const lengthValue = /^-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|dvh|dvw|svh|svw|vmin|vmax|ch|ex|rpx)?$/;
const colorValue = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([^()]+\)|[a-z]+)$/i;
const borderStyles = new Map([["solid", "实线"], ["dashed", "虚线"], ["dotted", "点线"], ["double", "双线"], ["none", "无"], ["hidden", "隐藏"], ["groove", "凹槽"], ["ridge", "凸脊"], ["inset", "内嵌"], ["outset", "外凸"]]);

function splitTopLevel(value, separator = ",") {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) { if (character === quote && value[index - 1] !== "\\") quote = ""; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (depth === 0 && (separator === " " ? /\s/.test(character) : character === separator)) {
      if (value.slice(start, index).trim()) parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (value.slice(start).trim()) parts.push(value.slice(start).trim());
  return parts;
}

function compoundSelector(text) {
  const result = { tag: "", classes: [], ids: [], attributes: [], states: [], specificity: [0, 0, 0] };
  let rest = text;
  const tag = /^(\*|[a-zA-Z][\w-]*)/.exec(rest);
  if (tag) { result.tag = tag[0]; result.specificity[2] += tag[0] === "*" ? 0 : 1; rest = rest.slice(tag[0].length); }
  while (rest) {
    let match = /^([.#])([\w-]+)/.exec(rest);
    if (match) {
      result[match[1] === "." ? "classes" : "ids"].push(match[2]);
      result.specificity[match[1] === "#" ? 0 : 1] += 1;
    } else if ((match = /^\[([\w-]+)(?:\s*=\s*(?:"([^"\\]*)"|'([^'\\]*)'|([\w-]+)))?\]/.exec(rest))) {
      result.attributes.push({ name: match[1], value: match[2] ?? match[3] ?? match[4] });
      result.specificity[1] += 1;
    } else if ((match = /^:([\w-]+)/.exec(rest)) && Object.hasOwn(stateNames, match[1])) {
      result.states.push(match[1]); result.specificity[1] += 1;
    } else return null;
    rest = rest.slice(match[0].length);
  }
  return result.tag || result.classes.length || result.ids.length || result.attributes.length || result.states.length ? result : null;
}

function parseSelector(selector) {
  const normalized = selector.trim().replace(/\s*>\s*/g, " > ");
  const tokens = splitTopLevel(normalized, " ");
  const compounds = [];
  const combinators = [];
  for (const token of tokens) {
    if (token === ">") {
      if (!compounds.length || combinators.length === compounds.length) return null;
      combinators.push(">");
      continue;
    }
    const compound = compoundSelector(token);
    if (!compound) return null;
    if (compounds.length && combinators.length < compounds.length) combinators.push(" ");
    compounds.push(compound);
  }
  if (!compounds.length || combinators.length !== compounds.length - 1) return null;
  return { compounds, combinators, specificity: compounds.reduce((sum, item) => sum.map((value, index) => value + item.specificity[index]), [0, 0, 0]) };
}

function matchesCompound(node, compound) {
  return (!compound.tag || compound.tag === "*" || node.tag === compound.tag)
    && compound.classes.every((name) => node.classes.includes(name))
    && compound.ids.every((name) => node.attributes.id === name)
    && compound.attributes.every(({ name, value }) => Object.hasOwn(node.attributes, name) && (value === undefined || String(node.attributes[name]) === value))
    && compound.states.every((state) => state === "disabled" ? ["button", "input", "select", "textarea", "option", "optgroup", "fieldset"].includes(node.tag) : state === "checked" ? node.tag === "option" || node.tag === "input" && ["checkbox", "radio"].includes(node.attributes.type) : true);
}

function matchSelector(node, selector, byId) {
  function match(current, index) {
    if (!current || !matchesCompound(current, selector.compounds[index])) return null;
    const states = selector.compounds[index].states.map((state) => ({ nodeId: current.id, state }));
    if (index === 0) return states;
    let parent = byId.get(current.parentId);
    if (selector.combinators[index - 1] === ">") {
      const previous = match(parent, index - 1);
      return previous ? [...previous, ...states] : null;
    }
    while (parent) {
      const previous = match(parent, index - 1);
      if (previous) return [...previous, ...states];
      parent = byId.get(parent.parentId);
    }
    return null;
  }
  return match(node, selector.compounds.length - 1);
}

function relevantSelector(selector, nodes) {
  const names = [...selector.matchAll(/([.#])([\w-]+)/g)];
  if (names.length) return names.some((match) => nodes.some((node) => match[1] === "." ? node.classes.includes(match[2]) : node.attributes.id === match[2]));
  const tags = selector.match(/(?:^|[\s>+~,])([a-zA-Z][\w-]*)/g) ?? [];
  return !tags.length || tags.some((tag) => nodes.some((node) => node.tag === tag.trim()));
}

function expandDeclaration(property, value) {
  if (["padding", "margin"].includes(property)) {
    const values = splitTopLevel(value, " ");
    if (values.length >= 1 && values.length <= 4) {
      const [top, right = top, bottom = top, left = right] = values;
      return [top, right, bottom, left].map((part, index) => [`${property}-${["top", "right", "bottom", "left"][index]}`, part]);
    }
  }
  if (property === "border") {
    const parts = splitTopLevel(value, " ");
    const width = parts.find((part) => lengthValue.test(part) || ["thin", "medium", "thick"].includes(part));
    const style = parts.find((part) => borderStyles.has(part));
    const colors = parts.filter((part) => part !== width && part !== style);
    if (colors.length <= 1 && (!colors.length || colorValue.test(colors[0]))) return [["border-width", width ?? "medium"], ["border-style", style ?? "none"], ["border-color", colors[0] ?? "currentColor"]];
  }
  if (property === "background") {
    if (colorValue.test(value)) return [["background-color", value === "none" ? "transparent" : value], ["background-image", "none"]];
    if (/^(?:linear|radial|conic)-gradient\(/.test(value) || /^url\(/.test(value)) return [["background-color", "transparent"], ["background-image", value]];
  }
  return [[property, value]];
}

function priorityCompare(left, right) {
  if (left.important !== right.important) return Number(left.important) - Number(right.important);
  for (let index = 0; index < left.specificity.length; index += 1) if (left.specificity[index] !== right.specificity[index]) return left.specificity[index] - right.specificity[index];
  return 0;
}

function putDeclaration(properties, property, entry) {
  const previous = properties.get(property);
  const priority = previous ? priorityCompare(entry, previous) : 1;
  if (priority < 0) return;
  if (priority === 0 && previous.sourceFile !== entry.sourceFile && (previous.value !== entry.value || previous.ambiguous)) {
    properties.set(property, { ...entry, ambiguous: true });
  } else properties.set(property, entry);
}

function mediaDescription(condition) {
  if (/^\(prefers-reduced-motion\s*:\s*reduce\)$/.test(condition)) return "系统偏好减少动态效果时";
  if (/^\(prefers-color-scheme\s*:\s*(dark|light)\)$/.test(condition)) return /dark/.test(condition) ? "系统偏好深色模式时" : "系统偏好浅色模式时";
  const match = /^\((max|min)-width\s*:\s*([\d.]+(?:px|rem|em))\)$/.exec(condition);
  if (match) return `视口宽度${match[1] === "max" ? "不超过" : "至少为"} ${match[2]} 时`;
  return null;
}

function collectStyles(nodes, styles, unresolved) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map();
  const keyframes = new Map();
  let order = 0;
  function groupFor(nodeId, conditions = [], states = []) {
    const key = JSON.stringify([nodeId, conditions, states]);
    if (!groups.has(key)) groups.set(key, { nodeId, conditions, states, properties: new Map() });
    return groups.get(key);
  }
  for (const style of styles) {
    let root;
    try { root = postcss.parse(style.css); }
    catch (error) {
      if (error.name !== "CssSyntaxError") throw error;
      unresolved.add("部分 CSS 样式无法解析，需要核对有效的样式声明。");
      continue;
    }
    root.walkAtRules(/^(?:-webkit-)?keyframes$/, (atRule) => {
      if (atRule.parent.type !== "root") return;
      const key = `${style.ownerSourceFile ?? ""}\0${atRule.params}`;
      const previous = keyframes.get(key);
      if (previous && previous.sourceFile !== style.sourceFile) keyframes.set(key, { ambiguous: true });
      else keyframes.set(key, { rule: atRule, sourceFile: style.sourceFile });
    });
    root.walkRules((rule) => {
      let ancestor = rule.parent;
      const conditions = [];
      let unsupported = false;
      while (ancestor.type !== "root") {
        if (ancestor.type === "atrule" && /keyframes$/.test(ancestor.name)) return;
        const condition = ancestor.type === "atrule" && ancestor.name === "media" ? mediaDescription(ancestor.params.trim()) : null;
        if (condition) conditions.unshift(condition);
        else unsupported = true;
        ancestor = ancestor.parent;
      }
      for (const rawSelector of splitTopLevel(rule.selector)) {
        const candidates = nodes.filter((node) => !style.ownerSourceFile || node.sourceFile === style.ownerSourceFile);
        if (unsupported) {
          if (relevantSelector(rawSelector, candidates)) unresolved.add("部分条件样式或嵌套规则尚不能确认，需要核对实际生效条件。");
          continue;
        }
        const globalVariables = rawSelector === ":root" && !style.ownerSourceFile;
        const selector = globalVariables ? null : parseSelector(rawSelector);
        if (!globalVariables && !selector) {
          if (relevantSelector(rawSelector, candidates)) unresolved.add("部分复杂选择器尚不能与组件结构准确对应，需要核对生效范围。");
          continue;
        }
        const matches = globalVariables ? [{ node: { id: null }, states: [] }] : candidates.map((node) => ({ node, states: matchSelector(node, selector, byId) })).filter((match) => match.states !== null);
        for (const { node, states } of matches) {
          const group = groupFor(node.id, conditions, states);
          for (const declaration of rule.nodes ?? []) {
            if (declaration.type !== "decl" || (globalVariables && !declaration.prop.startsWith("--"))) continue;
            for (const [property, value] of expandDeclaration(declaration.prop, declaration.value)) putDeclaration(group.properties, property, { value, important: Boolean(declaration.important), specificity: selector?.specificity ?? [0, 1, 0], sourceFile: style.sourceFile, order: order++ });
          }
        }
      }
    });
  }
  for (const node of nodes) {
    const group = groupFor(node.id);
    for (const [property, raw] of Object.entries(node.inlineStyle)) {
      for (const [expanded, value] of expandDeclaration(property, String(raw).replace(/\s*!important\s*$/, ""))) putDeclaration(group.properties, expanded, { value, important: /!important\s*$/.test(String(raw)), specificity: [1e6, 0, 0], sourceFile: `inline:${node.id}`, order: order++ });
    }
  }
  return { groups: [...groups.values()], keyframes, byId };
}

function nodeLabel(node) {
  let label;
  if (/^h[1-6]$/.test(node.tag)) label = "标题";
  else if (node.tag === "input") label = ({ email: "邮箱输入框", password: "密码输入框", checkbox: "复选框", radio: "单选框", range: "滑块", search: "搜索框", number: "数字输入框", submit: "提交按钮", button: "按钮", file: "文件选择控件" })[node.attributes.type] ?? "输入框";
  else label = ({ button: "按钮", p: "正文", span: "文本", small: "辅助文案", img: "图片", image: "图片", svg: "矢量图形", path: "矢量路径", a: "链接", ul: "无序列表", ol: "有序列表", li: "列表项", nav: "导航区", header: "页头", footer: "页尾", textarea: "多行输入框", select: "选择控件", form: "表单", video: "视频", canvas: "画布", label: "字段标签" })[node.tag] ?? (node.parentId === null ? "外层内容区" : "内容区");
  const text = node.text || (node.tag === "img" || node.tag === "image" ? node.attributes.alt : "");
  return text ? `${label}“${cleanText(text)}”` : label;
}

function cleanText(value) {
  return String(value).replace(/[`<>\r\n]/g, "").replace(/\s+/g, " ").trim();
}

function color(value) {
  return colorNames[value.toLowerCase()] ?? value;
}

function transparency(value) {
  const rgba = /^rgba?\((.*)\)$/.exec(value);
  if (!rgba) return false;
  const alpha = rgba[1].includes("/") ? rgba[1].split("/")[1].trim() : splitTopLevel(rgba[1])[3];
  return alpha !== undefined && (alpha.endsWith("%") ? Number.parseFloat(alpha) < 100 : Number(alpha) < 1);
}

function background(value) {
  if (/url\(/i.test(value)) return "背景使用图像素材";
  const gradient = /^(linear|radial|conic)-gradient\((.*)\)$/.exec(value);
  if (gradient) return `背景使用${({ linear: "线性", radial: "径向", conic: "锥形" })[gradient[1]]}渐变（${splitTopLevel(gradient[2]).map(color).join(" → ")}）`;
  return `${transparency(value) ? "半透明背景" : "背景颜色"} ${color(value)}`;
}

function describeTransform(value) {
  if (value === "none") return "取消变换";
  const parts = [...value.matchAll(/([a-zA-Z0-9]+)\(([^()]*)\)/g)];
  if (!parts.length || parts.map((part) => part[0]).join("").replace(/\s/g, "") !== value.replace(/\s/g, "")) return null;
  const descriptions = [];
  for (const [, name, args] of parts) {
    const values = splitTopLevel(args).flatMap((part) => splitTopLevel(part, " "));
    if (!values.every((part) => /^-?(?:\d*\.)?\d+(?:px|rem|em|%|deg|turn)?$/.test(part))) return null;
    if (["translateX", "translateY"].includes(name) && values.length === 1) {
      const negative = values[0].startsWith("-");
      descriptions.push(`${name === "translateY" ? negative ? "上移" : "下移" : negative ? "左移" : "右移"} ${values[0].replace(/^-/, "")}`);
    } else if (name === "translate" && values.length <= 2) descriptions.push(`水平位移 ${values[0]}${values[1] ? `、垂直位移 ${values[1]}` : ""}`);
    else if (["scale", "scaleX", "scaleY"].includes(name) && values.length <= 2) descriptions.push(`${name === "scaleX" ? "水平" : name === "scaleY" ? "垂直" : ""}缩放至 ${values.join(" × ")} 倍`);
    else if (["rotate", "rotateX", "rotateY", "rotateZ", "skewX", "skewY", "perspective"].includes(name) && values.length === 1) descriptions.push(`${({ rotate: "旋转", rotateX: "绕水平轴旋转", rotateY: "绕垂直轴旋转", rotateZ: "平面旋转", skewX: "水平倾斜", skewY: "垂直倾斜", perspective: "透视距离" })[name]} ${values[0]}`);
    else return null;
  }
  return descriptions.join("，");
}

function describeShadow(value) {
  if (value === "none") return "无投影";
  const shadows = [];
  for (const shadow of splitTopLevel(value)) {
    const parts = splitTopLevel(shadow, " ");
    const inset = parts.includes("inset");
    const lengths = parts.filter((part) => /^-?(?:\d*\.)?\d+(?:px|rem|em)?$/.test(part));
    const colors = parts.filter((part) => part !== "inset" && !lengths.includes(part));
    if (lengths.length < 2 || lengths.length > 4 || colors.length > 1) return null;
    shadows.push(`${inset ? "内" : ""}投影：水平偏移 ${lengths[0]}、垂直偏移 ${lengths[1]}、模糊半径 ${lengths[2] ?? "0"}、扩散 ${lengths[3] ?? "0"}${colors.length ? `、颜色 ${color(colors[0])}` : ""}`);
  }
  return shadows.join("；");
}

function describeTransition(value) {
  if (value === "none") return "关闭过渡";
  const descriptions = [];
  for (const part of splitTopLevel(value)) {
    const tokens = splitTopLevel(part, " ");
    const times = tokens.filter((token) => /^\d*\.?\d+(ms|s)$/.test(token));
    const easing = tokens.find((token) => Object.hasOwn(easingNames, token) || /^(cubic-bezier|steps)\(/.test(token));
    const properties = tokens.filter((token) => !times.includes(token) && token !== easing);
    if (properties.length > 1 || (properties.length && !/^[a-z-]+$/.test(properties[0]))) return null;
    const property = properties[0] ?? "all";
    descriptions.push(`${propertyNames[property] ?? "指定属性"}变化以 ${times[0] ?? "0s"} 过渡${easing ? `，${easingNames[easing] ?? easing}` : ""}${times[1] ? `，延迟 ${times[1]}` : ""}`);
  }
  return descriptions.join("；");
}

function describeProperty(property, value, properties) {
  const text = (section, description) => [section, description];
  if (["inherit", "initial", "unset", "revert", "revert-layer"].includes(value)) return null;
  const dimensions = { width: "宽度", height: "高度", "min-width": "最小宽度", "max-width": "最大宽度", "min-height": "最小高度", "max-height": "最大高度", gap: "元素间距", "row-gap": "行间距", "column-gap": "列间距", "aspect-ratio": "宽高比", top: "距顶部", right: "距右侧", bottom: "距底部", left: "距左侧" };
  if (dimensions[property]) {
    const values = splitTopLevel(value, " ");
    const valid = property === "aspect-ratio" ? /^\d*\.?\d+(?:\s*\/\s*\d*\.?\d+)?$/.test(value) : values.length <= 2 && values.every((part) => lengthValue.test(part) || ["auto", "none", "min-content", "max-content", "fit-content", "normal"].includes(part));
    return valid ? text("布局", `${dimensions[property]} ${value}`) : null;
  }
  if (property === "display") return text("布局", ({ flex: `${properties.get("flex-direction") === "column" ? "纵向" : properties.get("flex-direction") === "row" ? "横向" : ""}弹性布局`, "inline-flex": "行内弹性布局", grid: "网格布局", "inline-grid": "行内网格布局", block: "块级布局", "inline-block": "行内块布局", inline: "行内布局", none: "隐藏，不占据布局空间", contents: "容器自身不生成布局盒" })[value]);
  if (property === "flex-direction") return value === "column" && properties.get("display") === "flex" || value === "row" && properties.get("display") === "flex" ? text("布局", "") : text("布局", ({ row: "弹性项目沿横向排列", column: "弹性项目沿纵向排列", "row-reverse": "弹性项目沿横向逆序排列", "column-reverse": "弹性项目沿纵向逆序排列" })[value]);
  if (property === "grid-template-columns") {
    const repeated = /^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/.exec(value);
    return text("布局", repeated ? `${repeated[1]} 列等宽` : value === "1fr" ? "1 列布局" : `网格列宽 ${value}`);
  }
  if (["justify-content", "align-items", "align-content", "align-self"].includes(property)) {
    const alignment = ({ center: "居中", "flex-start": "起点对齐", start: "起点对齐", "flex-end": "终点对齐", end: "终点对齐", "space-between": "两端对齐并均分剩余间隙", "space-around": "两侧均分间隙", "space-evenly": "等间距分布", stretch: "拉伸对齐", baseline: "基线对齐" })[value];
    return text("布局", alignment ? `${({ "justify-content": "主轴", "align-items": "交叉轴", "align-content": "多行内容", "align-self": "自身交叉轴" })[property]}${alignment}` : null);
  }
  if (property === "flex-wrap") return text("布局", ({ wrap: "弹性项目允许换行", nowrap: "弹性项目不换行", "wrap-reverse": "弹性项目反向换行" })[value]);
  if (property === "position") return text("布局", ({ relative: "相对定位", absolute: "绝对定位", fixed: "固定定位", sticky: "粘性定位", static: "常规文档流定位" })[value]);
  if (property === "overflow" || property === "overflow-x" || property === "overflow-y") return text("布局", `${property === "overflow-x" ? "横向" : property === "overflow-y" ? "纵向" : ""}${({ hidden: "裁切溢出内容", clip: "裁切溢出内容", auto: "内容溢出时可滚动", scroll: "保留滚动区域", visible: "溢出内容可见" })[value] ?? "溢出处理待确认"}`);
  if (property === "background-image" && value === "none") return text("视觉", "");
  if (property === "background" || property === "background-color" || property === "background-image") return text("视觉", background(value));
  if (property === "fill" && value === "none") return text("视觉", "图形不填充");
  if (property === "stroke" && value === "none") return text("视觉", "图形不描边");
  if (property === "color" || property === "fill" || property === "stroke") return text("视觉", `${({ color: "文字颜色", fill: "图形填充颜色", stroke: "图形描边颜色" })[property]} ${color(value)}`);
  if (property === "opacity") return text("视觉", `不透明度 ${value}`);
  if (property === "border-radius") return text("视觉", `圆角 ${value}`);
  if (/^border(?:-(?:top|right|bottom|left))?$/.test(property) || property === "outline") {
    const label = property === "outline" ? "外轮廓" : `${({ "border-top": "顶部", "border-right": "右侧", "border-bottom": "底部", "border-left": "左侧" })[property] ?? ""}描边`;
    return text("视觉", `${label} ${value.replace(/\b(solid|dashed|dotted|double|none)\b/g, (word) => ({ solid: "实线", dashed: "虚线", dotted: "点线", double: "双线", none: "无" })[word])}`);
  }
  if (["border-color", "border-width", "border-style", "outline-offset"].includes(property)) return text("视觉", `${({ "border-color": "描边颜色", "border-width": "描边宽度", "border-style": "描边线型", "outline-offset": "外轮廓偏移" })[property]} ${borderStyles.get(value) ?? color(value)}`);
  if (property === "box-shadow" || property === "text-shadow") return text("视觉", describeShadow(value)?.replace(/^投影/, property === "text-shadow" ? "文字投影" : "投影"));
  if (property === "filter" || property === "backdrop-filter") {
    const blur = /^blur\(([\d.]+(?:px|rem|em))\)$/.exec(value);
    return text("视觉", blur ? `${property === "filter" ? "元素" : "背景"}模糊半径 ${blur[1]}` : value === "none" ? `取消${property === "filter" ? "元素" : "背景"}滤镜` : null);
  }
  const typography = { "font-size": "字号", "font-weight": "字重", "line-height": "行高", "letter-spacing": "字距", "font-family": "字体", "text-decoration": "文字装饰" };
  if (typography[property]) return text("视觉", `${typography[property]} ${value}`);
  if (property === "text-align") return text("视觉", `文字${({ center: "居中", left: "左对齐", right: "右对齐", justify: "两端对齐", start: "起点对齐", end: "终点对齐" })[value] ?? "对齐方式待确认"}`);
  if (property === "object-fit") return text("视觉", ({ cover: "图像等比放大并裁切以填满区域", contain: "图像等比缩放，完整显示于区域内", fill: "图像拉伸填满区域", none: "图像保持原始尺寸", "scale-down": "图像按需等比缩小" })[value]);
  if (property === "transform") return text("动效", describeTransform(value));
  if (property === "transition") return text("动效", describeTransition(value));
  if (property === "cursor") return text("交互", ({ pointer: "指针呈手形", default: "使用默认指针", "not-allowed": "指针显示不可操作状态", grab: "指针显示可抓取状态", grabbing: "指针显示正在抓取状态", text: "指针显示文本选择状态" })[value]);
  if (property === "pointer-events" && value === "none") return text("交互", "不响应指针命中");
  return null;
}

function describeAnimation(properties, node, keyframes, resolveValue, unresolved) {
  const shorthand = properties.get("animation");
  const longName = properties.get("animation-name");
  if (!shorthand && !longName) return [];
  if (shorthand === "none" || longName === "none") return ["关闭关键帧动画"];
  const results = [];
  const animations = shorthand ? splitTopLevel(shorthand) : splitTopLevel(longName);
  for (const animation of animations) {
    const tokens = shorthand ? splitTopLevel(animation, " ") : [animation];
    const times = tokens.filter((token) => /^\d*\.?\d+(ms|s)$/.test(token));
    const easing = tokens.find((token) => Object.hasOwn(easingNames, token));
    const iteration = tokens.find((token) => token === "infinite" || /^\d+(?:\.\d+)?$/.test(token));
    const modes = new Set(["normal", "reverse", "alternate", "alternate-reverse", "none", "forwards", "backwards", "both", "running", "paused"]);
    const names = tokens.filter((token) => !times.includes(token) && token !== easing && token !== iteration && !modes.has(token));
    const definition = names.length === 1 ? keyframes.get(`${node.sourceFile}\0${names[0]}`) ?? keyframes.get(`\0${names[0]}`) : null;
    if (!definition?.rule || definition.ambiguous) { unresolved.add("部分动画的关键帧定义或生效范围尚未确认。"); continue; }
    const frames = [];
    for (const frame of definition.rule.nodes ?? []) {
      if (frame.type !== "rule" || !splitTopLevel(frame.selector).every((part) => /^(from|to|\d+(?:\.\d+)?%)$/.test(part))) continue;
      const declarations = [];
      for (const declaration of frame.nodes ?? []) {
        if (declaration.type !== "decl") continue;
        const value = resolveValue(declaration.value);
        const description = value && describeProperty(declaration.prop, value, properties);
        if (description?.[1]) declarations.push(description[1]);
        else unresolved.add("部分关键帧属性尚不能转换为可确认的效果。");
      }
      if (declarations.length) frames.push(`${frame.selector.replace(/\bfrom\b/g, "起点").replace(/\bto\b/g, "终点")}：${declarations.join("，")}`);
    }
    if (!frames.length) { unresolved.add("动画缺少可确认的关键帧效果。"); continue; }
    const duration = shorthand ? times[0] ?? "0s" : properties.get("animation-duration") ?? "0s";
    const count = shorthand ? iteration : properties.get("animation-iteration-count");
    const timing = shorthand ? easing : properties.get("animation-timing-function");
    const direction = shorthand ? tokens.find((token) => ["reverse", "alternate", "alternate-reverse"].includes(token)) : properties.get("animation-direction");
    const delay = shorthand ? times[1] : properties.get("animation-delay");
    results.push(`关键帧动画每轮 ${duration}${count === "infinite" ? "，无限循环" : count ? `，播放 ${count} 次` : ""}${timing ? `，${easingNames[timing] ?? timing}` : ""}${direction ? `，${({ reverse: "反向播放", alternate: "往返交替播放", "alternate-reverse": "反向起始并往返交替播放" })[direction] ?? "播放方向待确认"}` : ""}${delay ? `，延迟 ${delay}` : ""}；${frames.join("；")}`);
  }
  return results;
}

export function describeComponentDesignEvidence({ nodes, styles, unresolved: initialUnresolved }) {
  const unresolved = new Set(initialUnresolved);
  const output = Object.fromEntries(sections.map((section) => [section, []]));
  const { groups, keyframes, byId } = collectStyles(nodes, styles, unresolved);
  const baseGroups = new Map(groups.filter((group) => !group.conditions.length && !group.states.length).map((group) => [group.nodeId, group]));
  const append = (section, text) => { if (text) output[section].push(text); };
  for (const node of nodes) {
    const label = nodeLabel(node);
    append("布局", `${node.conditional ? "条件满足时显示" : node.parentId === null ? "主体为" : `在${nodeLabel(byId.get(node.parentId))}内包含`}${label}`);
    const attributes = node.attributes;
    if (attributes.placeholder) append("交互", `${label}的输入提示为“${cleanText(attributes.placeholder)}”`);
    if (present(attributes.required)) append("交互", `${label}为必填项`);
    if (present(attributes.disabled)) append("交互", `${label}处于禁用状态`);
    if (present(attributes.readOnly) || present(attributes.readonly)) append("交互", `${label}为只读`);
    if (attributes["aria-label"]) append("交互", `${label}的无障碍名称为“${cleanText(attributes["aria-label"])}”`);
    if (node.events.length) {
      const events = [...new Set(node.events.map((event) => ({ click: "点击", change: "值变化", input: "输入", focus: "聚焦", blur: "失焦", submit: "提交", mouseenter: "指针移入", mouseleave: "指针移出", keydown: "按键", keyup: "松开按键", scroll: "滚动" })[event.replace(/^on/, "").toLowerCase()] ?? "操作"))];
      append("交互", `${label}绑定${events.join("、")}事件，具体反馈待确认`);
      unresolved.add("事件绑定只能确认操作入口，具体反馈与业务结果需要核对。");
    }
  }
  let translatedStyles = 0;
  for (const group of groups) {
    const node = byId.get(group.nodeId);
    if (!node) continue;
    function variable(name) {
      let current = node;
      while (current) {
        const conditionalGroup = groups.find((item) => item.nodeId === current.id && JSON.stringify(item.conditions) === JSON.stringify(group.conditions) && JSON.stringify(item.states) === JSON.stringify(group.states));
        const value = conditionalGroup?.properties.get(name) ?? baseGroups.get(current.id)?.properties.get(name);
        if (value) return value.ambiguous ? null : value.value;
        current = byId.get(current.parentId);
      }
      const contextualRoot = groups.find((item) => item.nodeId === null && JSON.stringify(item.conditions) === JSON.stringify(group.conditions));
      const value = contextualRoot?.properties.get(name) ?? baseGroups.get(null)?.properties.get(name);
      return value && !value.ambiguous ? value.value : null;
    }
    function resolveValue(value, visited = new Set()) {
      let result = value;
      while (result.includes("var(")) {
        const start = result.indexOf("var(");
        let depth = 1;
        let end = start + 4;
        while (end < result.length && depth) { if (result[end] === "(") depth += 1; if (result[end] === ")") depth -= 1; end += 1; }
        if (depth) return null;
        const [name, ...fallback] = splitTopLevel(result.slice(start + 4, end - 1));
        if (!/^--[\w-]+$/.test(name) || visited.has(name)) { unresolved.add("样式变量缺少可确认的值或存在循环引用。"); return null; }
        const raw = variable(name) ?? (fallback.length ? fallback.join(", ") : null);
        if (raw === null) { unresolved.add("样式变量缺少可确认的值，需要核对实际样式环境。"); return null; }
        const replacement = resolveValue(raw, new Set([...visited, name]));
        if (replacement === null) return null;
        result = result.slice(0, start) + replacement + result.slice(end);
      }
      if (/\b(?:calc|env)\(/.test(result)) { unresolved.add("部分位移、尺寸或变换表达式需要在实际布局中核对。"); return null; }
      return result;
    }
    const properties = new Map();
    for (const [property, entry] of group.properties) {
      if (property.startsWith("--")) continue;
      if (entry.ambiguous) { unresolved.add("不同样式文件存在同等优先级的冲突，需要核对加载顺序。"); continue; }
      const defaultEntry = baseGroups.get(node.id)?.properties.get(property);
      if (defaultEntry && baseGroups.get(node.id) !== group) {
        const priority = priorityCompare(defaultEntry, entry);
        if (priority > 0 || priority === 0 && defaultEntry.sourceFile === entry.sourceFile && defaultEntry.order > entry.order) continue;
        if (priority === 0 && defaultEntry.sourceFile !== entry.sourceFile && defaultEntry.value !== entry.value) {
          unresolved.add("不同样式文件存在同等优先级的冲突，需要核对加载顺序。");
          continue;
        }
      }
      const value = resolveValue(entry.value);
      if (value !== null) properties.set(property, value);
    }
    const conditions = [...group.conditions, ...group.states.map(({ nodeId, state }) => `${nodeId === node.id ? "" : nodeLabel(byId.get(nodeId))}${stateNames[state]}`)];
    if (node.conditional) conditions.unshift("条件满足并显示时");
    const prefix = `${conditions.length ? `${conditions.join("且")}，` : ""}${nodeLabel(node)}`;
    const descriptions = Object.fromEntries(sections.map((section) => [section, []]));
    if (properties.has("border-style")) {
      const line = properties.get("border-style");
      if (line === "none" || properties.get("border-width") === "0") descriptions.视觉.push("无描边");
      else descriptions.视觉.push(`描边 ${properties.get("border-width") ?? ""} ${borderStyles.get(line) ?? line}${properties.has("border-color") ? `，颜色 ${properties.get("border-color") === "currentColor" ? "随文字颜色" : color(properties.get("border-color"))}` : ""}`.trim());
    }
    for (const spacing of ["padding", "margin"]) {
      const values = ["top", "right", "bottom", "left"].map((side) => properties.get(`${spacing}-${side}`));
      if (values.some(Boolean)) {
        const spacingText = values.every((value) => value && value === values[0]) ? values[0] : values.map((value, index) => value ? `${["上", "右", "下", "左"][index]} ${value}` : "").filter(Boolean).join("、");
        descriptions.布局.push(`${spacing === "padding" ? "内" : "外"}边距 ${spacingText}`);
      }
    }
    for (const [property, value] of properties) {
      if (/^(padding|margin)-(top|right|bottom|left)$/.test(property) || property.startsWith("animation")) continue;
      if (/^border-(width|style|color)$/.test(property) && properties.has("border-style")) continue;
      const description = describeProperty(property, value, properties);
      if (description && description[1] === "") continue;
      if (description?.[1]) descriptions[description[0]].push(description[1]);
      else unresolved.add(property === "transform" ? "部分变换效果尚不能准确描述，需要核对实际位移或旋转。" : "部分样式属性尚不能转换为可确认的效果描述。");
    }
    descriptions.动效.push(...describeAnimation(properties, node, keyframes, resolveValue, unresolved));
    for (const section of sections) if (descriptions[section].length) {
      translatedStyles += descriptions[section].length;
      append(section, `${prefix}${descriptions[section].join("，")}`);
    }
    if (group.states.length && !descriptions.交互.length) {
      const feedback = ["布局", "视觉", "动效"].filter((section) => descriptions[section].length);
      if (feedback.length) append("交互", `${prefix}呈现上述${feedback.join("、")}反馈`);
    }
  }
  if (!translatedStyles) unresolved.add("样式依据不足，具体视觉参数与动效需要确认。");
  const empty = { 布局: "缺少可确认的结构和布局依据。", 视觉: "样式依据不足，配色、尺寸、材质等视觉效果待确认。", 动效: "未确认具体动效，不预设动画或过渡。", 交互: "未确认具体操作与反馈。" };
  const prompt = `请按以下要求实现组件效果；待确认的部分需进一步核对。\n\n${sections.map((section) => `## ${section}\n${output[section].length ? [...new Set(output[section])].map((line) => `- ${line}。`).join("\n") : empty[section]}`).join("\n\n")}`;
  return { prompt, unresolved: [...unresolved].sort() };
}

export function buildComponentDesignDescription(component, { materials, scenario }) {
  return describeComponentDesignEvidence(extractComponentDesignStructure(component, { materials, scenario }));
}
