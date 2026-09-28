import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonicalSerialize } from '../utils/canonical-json.js';

const personalId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const inputFields = ['name', 'description', 'sourceKinds', 'focus', 'prompt', 'outputInstructions'];
const optionalInputFields = ['componentRules', 'includePages'];
const contentFields = ['id', 'version', ...inputFields];
const recordFields = [...contentFields, 'builtin', 'digest'];
const maximumVersion = 1_000_000;

function fields(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(value, key))) throw new Error('炼化方案字段不完整或包含未知字段。');
}

function text(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) {
    throw new Error(`炼化方案 ${label} 必须为非空文本，且不超过 ${maximum} 字符。`);
  }
}

function validateContent(value) {
  text(value.name, 'name', 160);
  text(value.description, 'description', 2_000);
  text(value.prompt, 'prompt', 50_000);
  for (const match of value.prompt.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    if (!['source', 'focus'].includes(match[1])) throw new Error(`不支持的提示词变量 {${match[1]}}；仅支持 {source} 和 {focus}。`);
  }
  text(value.outputInstructions, 'outputInstructions', 20_000);
  if (!Array.isArray(value.sourceKinds) || !value.sourceKinds.length || value.sourceKinds.length > 2
    || value.sourceKinds.some(kind => !['text', 'conversation', 'project'].includes(kind))
    || new Set(value.sourceKinds).size !== value.sourceKinds.length) throw new Error('炼化方案 sourceKinds 仅支持不重复的 text、conversation 或单独的 project。');
  if (value.sourceKinds.includes('project')) {
    if (value.sourceKinds.length !== 1) throw new Error('工程 project 方案不能同时选择文本或对话材料。');
    if (!value.componentRules || typeof value.componentRules !== 'object' || Array.isArray(value.componentRules)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value.componentRules))
      || Object.keys(value.componentRules).some(key => !['iconPrimitives', 'emptyShells', 'duplicates', 'headlessContainers', 'viewEntries'].includes(key))
      || !['iconPrimitives', 'emptyShells'].every(key => Object.hasOwn(value.componentRules, key) && ['include', 'exclude'].includes(value.componentRules[key]))
      || (Object.hasOwn(value.componentRules, 'duplicates') && !['merge-identical', 'keep'].includes(value.componentRules.duplicates))
      || (Object.hasOwn(value.componentRules, 'headlessContainers') && !['exclude', 'include'].includes(value.componentRules.headlessContainers))
      || (Object.hasOwn(value.componentRules, 'viewEntries') && !['context-only', 'include'].includes(value.componentRules.viewEntries))) {
      throw new Error('工程方案 componentRules 必须包含 iconPrimitives、emptyShells（include 或 exclude）；可选 duplicates（merge-identical 或 keep）、headlessContainers（exclude 或 include）、viewEntries（context-only 或 include），不接受其他字段或值。');
    }
  } else if (Object.hasOwn(value, 'componentRules')) throw new Error('仅工程 project 方案可包含 componentRules。');
  if (Object.hasOwn(value, 'includePages')) {
    if (!value.sourceKinds.includes('project')) throw new Error('仅工程 project 方案可包含 includePages。');
    if (typeof value.includePages !== 'boolean') throw new Error('工程方案 includePages 必须为布尔值。');
  }
  if (!Array.isArray(value.focus) || !value.focus.length || value.focus.length > 64
    || new Set(value.focus).size !== value.focus.length) throw new Error('炼化方案 focus 必须包含 1 至 64 个不重复关注点。');
  for (const item of value.focus) text(item, 'focus', 240);
}

function validateVersion(version) {
  if (!Number.isSafeInteger(version) || version < 1 || version > maximumVersion) throw new Error('炼化方案版本必须为有效正整数。');
}

function contentOf(recipe) {
  return Object.fromEntries([...contentFields, ...optionalInputFields.filter(key => Object.hasOwn(recipe, key))].map(key => [key, recipe[key]]));
}

function contentDigest(content) {
  return createHash('sha256').update(canonicalSerialize(content)).digest('hex');
}

function recipeRecord(id, version, content, builtin) {
  const fields = contentOf({ id, version, ...content });
  return { ...fields, builtin, digest: contentDigest(fields) };
}

const conversationDecisions = recipeRecord('conversation-decisions', 1, {
    name: '对话决定、修正与未决问题',
    description: '从选定对话片段回查决定变化，保留旧建议、明确修正和仍待确认的问题。',
    sourceKinds: ['text', 'conversation'],
    focus: ['用户明确决定与适用条件', '旧建议和修正依据', '未决问题与缺失证据', '执行声明和真实验证的区别'],
    prompt: '阅读用户显式提交的材料：\n{source}\n关注：\n{focus}\n提取有据的 decision（决定）、correction（修正）和 open-question（未决问题）。先核对发言角色、原始顺序及适用条件。只有用户明确纠正或材料存在直接依据时，才建立新决定到旧决定的 supersedes（取代）关系；明确解决问题时可建立 resolves（解决）关系，端点都必须是本次结果中的资产。保留旧决定证据，不把它混为当前要求。不因先后顺序自动认定取代，不将助手执行声明当作实际验证。纯文本角色不明时不猜测；无法确定的问题保持未决。',
    outputInstructions: '使用既有分析 JSON 协议；不要新增 status 或时间字段。每个资产和关系必须有原文唯一逐字引文，basis 区分 explicit 与 interpretation。summary 写明适用条件、限制与尚缺证据。用户没有实际发问或材料不支持未决问题时，不凑造 open-question。所有动作和结果只按材料实际支持程度陈述。',
  }, true);
const builtinV1 = [
  recipeRecord('general-knowledge', 1, {
    name: '通用知识提炼',
    description: '从材料中提炼有来源、适用条件明确且可以复用的知识。',
    sourceKinds: ['text', 'conversation'],
    focus: ['可复用知识', '适用条件与限制', '事实和推断的区别'],
    prompt: '请阅读以下真实材料：\n{source}\n\n本次关注：\n{focus}\n\n只提取材料能够支撑的知识。保留可以定位的原文证据，说明适用场景、限制以及推断依据。没有足够证据时不要生成结论。',
    outputInstructions: '遵循任务提供的分析 JSON 协议。每项资产与关系使用真实引文；明确事实与推断，不把尚未验证的建议称为已验证经验。',
  }, true),
  recipeRecord('conversation-learning', 1, {
    name: '对话与开发过程复盘',
    description: '从真实对话中提炼决策、约束、失败经验和可复用做法。',
    sourceKinds: ['conversation'],
    focus: ['已确认需求与约束', '决策和取舍', '失败原因', '验证结果与未决问题'],
    prompt: '请分析以下对话记录：\n{source}\n\n本次关注：\n{focus}\n\n识别用户确认的要求、方案演变、失败尝试和最终验证。保留每条结论的发言证据与适用条件。区分计划、执行声明和实际验证，不将助手的自我报告自动视为事实。',
    outputInstructions: '遵循任务提供的分析 JSON 协议。证据必须定位到原始发言；不同意见与未决事项需保留，不补写没有发生的行动、验证或结果。',
  }, true),
  conversationDecisions,
  recipeRecord('creator-analysis', 1, {
    name: '创作者账号样本分析',
    description: '分析用户显式选择的账号主页、作品样本与实际字幕，保留覆盖范围和证据限制。',
    sourceKinds: ['text'],
    focus: ['主页声明', '作品选题与表达', '样本覆盖与缺失', '定位和受众假设'],
    prompt: '阅读显式采集的创作者账号样本：\n{source}\n关注：\n{focus}\n区分作者在主页声明的定位、样本呈现的特点与分析建议。只有实际字幕可以支撑视频内容分析，不将标题、元数据或简介冒充视频全文；缺少字幕时明确覆盖限制。公开播放量不能证明收入、转化率或真实受众构成。对定位、受众与传播机制的推断使用 interpretation 并说明依据。保留采样范围，不宣称整账号全量分析。',
    outputInstructions: '遵循学习标准分析 JSON 协议，使用 creator-profile、creator-topic、creator-audience、creator-template、creator-transcript、creator-conversion 类型。资产和关系必须引用实际材料中唯一逐字匹配的证据；basis 区分 explicit 和 interpretation。不编造字幕、平台指标或结果。',
  }, true),
];

const duplicateGuidance = {
  'general-knowledge': '通用知识：先比较核心结论、操作方法和适用条件，再决定资产边界。同义改写、重复段落及说明同一方法的例子合并为一项，保留各自的有效证据；不要把同一知识的标题、摘要和例子分别做成资产。不同前提、适用条件或反例不能因关键词相同被合并，应保留差异与限制。',
  'conversation-learning': '对话复盘：围绕同一需求、决定或方法汇总重复发言与确认，不按发言轮次逐条拆卡。不同说法若只是重述同一做法，合并证据；保留角色归属。失败尝试、后续修正、不同立场与验证结果有不同含义时分别保留，不把计划、执行声明和实际验证合为一个已完成事实。',
  'conversation-decisions': '决定与修正：相同条件下对同一决定的重复确认合并证据；同一未决问题的改写不要另建问题卡。修正与被修正的决定、已解决问题与解决依据有不同含义，应分别保留必要资产和有据关系；不要为了去重丢失 supersedes 或 resolves 的端点。条件或立场改变并非同义重复，不因后发言自动覆盖先发言。',
  'creator-analysis': '账号样本：同一主页声明的重复摘录、多个样本支撑的同一选题或表达方法可合并为一项，并保留作品归属与样本证据。不要仅因可归入多个 creator 类型而重复生成同一结论，也不要把每个标题逐项改写成知识卡。不同作品的相反表现、不同适用条件及反例应保留。跨样本合并不能将局部共性说成整账号规律；元数据、主页声明和实际字幕的证据层级不得混同，重复元数据不能增强视频内容或真实受众结论。',
};
const knowledgeBuiltins = builtinV1.map(recipe => recipeRecord(recipe.id, 2, {
  ...Object.fromEntries(inputFields.map(key => [key, recipe[key]])),
  prompt: `${recipe.prompt}\n\n产出前去重：同一结论或方法的不同表达只生成一项资产，合并能定位的证据；重复发言不拆成多张卡。条件、立场或反例不同不得强行合并。\n${duplicateGuidance[recipe.id]}`,
  outputInstructions: `${recipe.outputInstructions}\n不要求资产或关系条数，允许零产出（assets 和 relations 均为空数组）。仅重复、无可复用结论或证据不足时不要凑数。合并后的证据逐条保留原始锚点与逐字引文，不拼接引文或重复同一证据项。去重范围仅限本次分析输出，不删除、改写或宣称已合并历史资产。`,
}, true));
const componentV1 = recipeRecord('component-distillation', 1, {
  name: '工程组件炼化',
  description: '从工程中提炼可复用组件与专业效果描述；默认排除独立图标素材及没有脚本、样式的纯插槽空壳，可另存个人方案调整。',
  sourceKinds: ['project'],
  focus: ['布局与视觉层级', '交互状态与动效', '复用边界与来源证据'],
  componentRules: { iconPrimitives: 'exclude', emptyShells: 'exclude' },
  prompt: '依据以下真实工程材料描述组件效果：\n{source}\n\n本次关注：\n{focus}\n\n使用精准、专业且可复现的语言说明布局、视觉层级、样式、交互状态和动效。来源中可以确认的事实与未确认项分别说明，不把静态分析推断写成浏览器实测结果。仅说明材料支持的行为，不补写没有依据的配色、尺寸、交互或效果。重复表达合并，同一组件依赖的图标素材不另写成完整交互组件。',
  outputInstructions: '输出可用于复现的组件需求描述，保留来源事实、复用条件、外部依赖及待核对项。重点说明布局、视觉、状态变化与操作响应；无法确认的细节明确为未知，不以泛化形容词代替具体证据，不宣称已完成运行验证。',
}, true);
const componentV2 = recipeRecord('component-distillation', 2, {
  ...Object.fromEntries([...inputFields, 'componentRules'].map(key => [key, componentV1[key]])),
  name: '工程页面与组件炼化',
  description: '提炼完整页面及可复用组件；页面当前支持 uni-app src/pages.json 注册页，保留页面来源与源码条件。页面范围和组件筛选均可另存个人方案调整。',
  includePages: true,
}, true);
const componentV3 = recipeRecord('component-distillation', 3, {
  ...Object.fromEntries([...inputFields, 'componentRules', 'includePages'].map(key => [key, componentV2[key]])),
  description: '提炼完整页面、嵌套业务区块和组件；当前支持 uni-app 注册页及 Vue Router 静态注册页，未注册视图保留来源说明。源码交互预览与效果提示词分别验证，依赖缺失不模拟成功。',
}, true);
const builtins = [...knowledgeBuiltins, recipeRecord('component-distillation', 4, {
  ...Object.fromEntries([...inputFields, 'includePages'].map(key => [key, componentV3[key]])),
  name: '工程交互组件与业务区块炼化',
  description: '重点提炼可复用交互组件与业务区块；uni-app 和 Vue Router 注册页面保留为真实调用场景，未注册整页视图默认仅作为来源场景。纯图标、空壳和无独立视觉表面的容器默认不独立产出，重复实现仅在源码与依赖一致时合并；全部规则可另存个人方案调整。',
  componentRules: { iconPrimitives: 'exclude', emptyShells: 'exclude', duplicates: 'merge-identical', headlessContainers: 'exclude', viewEntries: 'context-only' },
  focus: ['业务用途与复用边界', '输入输出与真实交互状态', '视觉表面和外部依赖', '相同实现合并与变体保留'],
  prompt: '依据以下真实工程材料提炼交互组件与业务区块：\n{source}\n\n本次关注：\n{focus}\n\n按业务用途、输入输出、真实触发与状态变化、外部依赖描述组件，明确布局、视觉层级与源码能够证明的效果参数。页面作为完整调用场景保留，不以页面数或文件数凑成果。未注册整页视图按配置决定仅作来源场景或作为组件候选，页面内已有组件和真实被其他模板调用的业务区块继续提炼。按本方案配置决定图标、空容器是否独立产出；排除时仍保留依赖，不冒充交互组件。仅源码完全相同且依赖一致才合并，近似变体不得强并，保留差异及各自来源。未独立拆出的内联业务区块只能标为提炼候选，不能假装已得到独立可复用组件。效果描述中分开说明源码事实、推断和未验证事项，不编造尺寸、配色、动效或操作结果。',
  outputInstructions: '输出专业、具体的组件复用描述：用途、输入输出、真实操作与状态、视觉效果、外部依赖及适用限制。合并相同实现时保留来源；按配置决定图标和空容器是否独立产出，排除时仍保留依赖。内联区块候选与已独立组件明确区分，不以数量代替复用价值，不将源码分析当作运行验证。',
}, true)];

function validateId(id) {
  if (typeof id !== 'string' || (!personalId.test(id) && !builtins.some(recipe => recipe.id === id))) {
    throw new Error('炼化方案 id 无效。');
  }
}

async function directory(path, create) {
  if (create) {
    try { await mkdir(path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  let info;
  try { info = await lstat(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) {
    throw new Error('炼化方案存储路径必须位于资产库内，且不能为符号链接。');
  }
  return path;
}

async function recipesDirectory(libraryRoot, create = false) {
  text(libraryRoot, 'libraryRoot', 32_768);
  const path = resolve(libraryRoot);
  if (create) await mkdir(path, { recursive: true });
  let root;
  try { root = await realpath(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return directory(join(root, 'recipes'), create);
}

async function versionsAt(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const versions = [];
  for (const entry of entries) {
    if (/^\.pending-[0-9a-f-]{36}$/.test(entry.name)) continue;
    if (!/^[1-9][0-9]*\.json$/.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('炼化方案版本存储路径或文件名无效。');
    }
    const version = Number(entry.name.slice(0, -5));
    validateVersion(version);
    versions.push(version);
  }
  return versions.sort((left, right) => left - right);
}

async function readRecord(path, id, version) {
  const filename = join(path, `${version}.json`);
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(filename) !== filename) {
    throw new Error('炼化方案版本路径必须为资产库内的常规文件。');
  }
  if (info.size > 1_000_000) throw new Error('炼化方案版本文件超过大小限制。');
  const value = JSON.parse(await readFile(filename, 'utf8'));
  fields(value, [...recordFields, ...optionalInputFields], recordFields);
  validateContent(value);
  validateVersion(value.version);
  if (value.id !== id || value.version !== version || value.builtin !== false) throw new Error('炼化方案版本身份不匹配。');
  if (typeof value.digest !== 'string' || value.digest !== contentDigest(contentOf(value))) throw new Error('炼化方案内容摘要不匹配。');
  return value;
}

/** Return the exact immutable version, or the latest committed version. */
export async function getRecipe(libraryRoot, id, version) {
  validateId(id);
  if (version !== undefined) validateVersion(version);
  const builtin = builtins.find(recipe => recipe.id === id);
  if (builtin) {
    const selected = version === undefined ? builtin : [...builtinV1, componentV1, componentV2, componentV3, ...builtins].find(recipe => recipe.id === id && recipe.version === version);
    if (!selected) throw new Error('内置炼化方案版本不存在。');
    return structuredClone(selected);
  }
  const root = await recipesDirectory(libraryRoot);
  const path = root && await directory(join(root, id), false);
  if (!path) throw new Error('个人炼化方案 id 不存在。');
  const versions = await versionsAt(path);
  const selected = version ?? versions.at(-1);
  if (!versions.includes(selected)) throw new Error('个人炼化方案版本不存在。');
  return readRecord(path, id, selected);
}

/** Built-ins first; personal recipes ordered by their stable ids. */
export async function listRecipes(libraryRoot) {
  const result = structuredClone(builtins);
  const root = await recipesDirectory(libraryRoot);
  if (!root) return result;
  for (const id of (await readdir(root)).sort()) {
    if (!personalId.test(id)) throw new Error('个人炼化方案存储路径包含无效 id。');
    const path = await directory(join(root, id), false);
    const versions = await versionsAt(path);
    if (versions.length) result.push(await readRecord(path, id, versions.at(-1)));
  }
  return result;
}

/** Omit id to make a personal copy; supplying a personal id appends a version. */
export async function saveRecipe(libraryRoot, input) {
  fields(input, ['id', ...inputFields, ...optionalInputFields], inputFields);
  validateContent(input);
  if (Object.hasOwn(input, 'id')) {
    validateId(input.id);
    if (builtins.some(recipe => recipe.id === input.id)) throw new Error('内置炼化方案不可覆盖，请保存为个人副本。');
    await getRecipe(libraryRoot, input.id);
  }
  const root = await recipesDirectory(libraryRoot, true);
  const id = input.id ?? randomUUID();
  const path = await directory(join(root, id), true);
  let version = ((await versionsAt(path)).at(-1) ?? 0) + 1;
  while (version <= maximumVersion) {
    const recipe = recipeRecord(id, version, input, false);
    const temporary = join(path, `.pending-${randomUUID()}`);
    await writeFile(temporary, `${JSON.stringify(recipe, null, 2)}\n`, { flag: 'wx' });
    try {
      // A hard link publishes the complete file atomically and cannot replace a version.
      await link(temporary, join(path, `${version}.json`));
      return recipe;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      version += 1;
    } finally {
      await unlink(temporary);
    }
  }
  throw new Error('炼化方案版本超过上限。');
}
