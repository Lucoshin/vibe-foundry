import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse, parseExpression } from '@babel/parser';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { NodeTypes, parse as parseTemplate } from '@vue/compiler-dom';

// pages.json supports comments; read its literal AST without executing project code.
function literalValue(node) {
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
  if (node.type === 'ArrayExpression') return node.elements.map(item => {
    if (!item) throw new Error('pages.json 不允许空数组项');
    return literalValue(item);
  });
  if (node.type === 'ObjectExpression') {
    const entries = new Map();
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed || property.key.type !== 'StringLiteral') {
        throw new Error('pages.json 必须使用静态 JSON 字段');
      }
      const key = property.key.value;
      if (entries.has(key)) throw new Error(`pages.json 字段重复：${key}`);
      entries.set(key, literalValue(property.value));
    }
    return Object.fromEntries(entries);
  }
  throw new Error('pages.json 包含非静态 JSON 值');
}

function routePath(value) {
  if (typeof value !== 'string' || !value || value.split('/').some(part => !part || part === '.' || part === '..') || /[\\?#:]/.test(value)) {
    throw new Error(`pages.json 页面路径无效：${String(value)}`);
  }
  return value;
}

function registeredPages(config) {
  if (!config || !Array.isArray(config.pages)) throw new Error('pages.json 的 pages 必须是数组');
  const pages = config.pages.map(page => ({ page, root: '' }));
  if (config.subPackages !== undefined) {
    if (!Array.isArray(config.subPackages)) throw new Error('pages.json 的 subPackages 必须是数组');
    for (const pack of config.subPackages) {
      const root = routePath(pack?.root);
      if (!Array.isArray(pack.pages)) throw new Error('pages.json 分包的 pages 必须是数组');
      pages.push(...pack.pages.map(page => ({ page, root })));
    }
  }
  const routes = new Map();
  for (const { page, root } of pages) {
    const path = routePath(page?.path);
    const route = root ? `${root}/${path}` : path;
    const title = page.style?.navigationBarTitleText;
    if (title !== undefined && typeof title !== 'string') throw new Error(`pages.json 页面标题必须是字符串：${route}`);
    const name = title?.trim() || route;
    if (routes.has(route) && routes.get(route).name !== name) throw new Error(`pages.json 同一路由存在不同标题：${route}`);
    routes.set(route, { route, name });
  }
  return [...routes.values()];
}

function componentBlocks(file) {
  const kebab = name => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const blocks = new Map();
  for (const call of file.componentCalls) {
    const matches = file.imports.filter(item => item.resolvedFilePath?.endsWith('.vue') &&
      (item.localName === call.localName || kebab(item.localName) === call.localName));
    if (matches.length !== 1) continue;
    const imported = matches[0];
    const block = { name: imported.localName, filePath: imported.resolvedFilePath, sourceLocation: call.sourceLocation };
    blocks.set(JSON.stringify(block), block);
  }
  return [...blocks.values()];
}

function templateStates(file) {
  const { descriptor, errors } = parseSfc(file.sourceText, { filename: file.filePath });
  if (errors.length) throw new Error(`页面解析失败 ${file.filePath}：${errors[0]}`);
  if (!descriptor.template) return [];
  const { content, loc } = descriptor.template;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'image']);
  const ast = parseTemplate(content, { isVoidTag: tag => voidTags.has(tag) });
  const states = [];
  function visit(node) {
    if (node.type === NodeTypes.ELEMENT) {
      for (const property of node.props) {
        if (property.type !== NodeTypes.DIRECTIVE || !['if', 'else-if', 'show'].includes(property.name) || !property.exp) continue;
        const start = property.loc.start;
        states.push({ directive: property.name, expression: property.exp.content, sourceLocation: {
          line: loc.start.line + start.line - 1,
          column: start.line === 1 ? loc.start.column + start.column - 1 : start.column,
        } });
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(ast);
  return states;
}

function pageAsset(file, registration, configPath, configText, limitations) {
  return {
    kind: 'page', ...registration, filePath: file.filePath,
    sourceFingerprint: createHash('sha256').update(JSON.stringify([file.sourceText, configText])).digest('hex'),
    sourceFiles: [file.filePath, configPath],
    blocks: componentBlocks(file), states: templateStates(file),
    limitations: [
      '页面已按源码登记；完整运行环境与交互效果尚未验证。',
      '组成区块仅包含可解析的组件调用；页面内未组件化业务区块尚未单独提炼。',
      ...limitations,
    ],
  };
}

function analyzeVueRouterPages(sourceIndex) {
  const configPath = 'src/router/index.js';
  const router = sourceIndex.files.find(file => file.filePath === configPath);
  if (!router) return [];
  const ast = parse(router.sourceText, { sourceType: 'module' });
  if (!ast.program.body.some(node => node.type === 'ImportDeclaration' && node.source.value === 'vue-router')) return [];
  const files = new Map(sourceIndex.files.map(file => [file.filePath, file]));
  const property = (node, name) => node?.properties?.find(item => item.type === 'ObjectProperty' && !item.computed && (item.key.name ?? item.key.value) === name)?.value;
  const pages = new Map();
  function visit(array, parentRoute, declaration) {
    for (const node of array.elements) {
      if (node?.type !== 'ObjectExpression') continue;
      const path = property(node, 'path');
      if (path?.type !== 'StringLiteral') continue;
      const route = path.value.startsWith('/') ? path.value : `${parentRoute.replace(/\/$/, '')}/${path.value}`;
      const component = property(node, 'component');
      const body = component?.type === 'ArrowFunctionExpression' ? component.body : null;
      const source = body?.type === 'ImportExpression' && body.source.type === 'StringLiteral' ? body.source.value : null;
      let filePath = component?.type === 'Identifier'
        ? router.imports.find(item => item.localName === component.name)?.resolvedFilePath : null;
      if (source?.startsWith('@/views/') || source?.startsWith('.')) {
        const base = source.startsWith('@/') ? `src/${source.slice(2)}` : posix.normalize(posix.join('src/router', source));
        if (base.startsWith('src/views/')) {
          const candidates = base.endsWith('.vue') ? [base] : [`${base}.vue`, `${base}/index.vue`];
          filePath = candidates.find(candidate => files.has(candidate));
          if (!filePath) throw new Error(`注册页面未进入源码索引：${source}`);
        }
      }
      if (filePath?.startsWith('src/views/') && filePath.endsWith('.vue')) {
        const title = property(property(node, 'meta'), 'title');
        const name = title?.type === 'StringLiteral' && title.value.trim() ? title.value : route;
        const registration = { route, name, sourceLocation: { line: node.loc.start.line, column: node.loc.start.column + 1 } };
        const previous = pages.get(filePath);
        if (previous && previous.route !== route) throw new Error(`同一页面存在多个静态路由，需确认页面身份：${filePath}`);
        pages.set(filePath, pageAsset(files.get(filePath), registration, configPath, router.sourceText, [
          declaration === 'dynamicRoutes' ? '此路由按权限动态注册，当前账号权限及可访问性尚未验证。' : '路由按静态声明登记，登录与页面数据条件尚未验证。',
        ]));
      }
      const children = property(node, 'children');
      if (children?.type === 'ArrayExpression') visit(children, route, declaration);
    }
  }
  for (const statement of ast.program.body) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    for (const declaration of statement.declaration?.declarations ?? []) {
      if (['constantRoutes', 'dynamicRoutes'].includes(declaration.id?.name) && declaration.init?.type === 'ArrayExpression') {
        visit(declaration.init, '', declaration.id.name);
      }
    }
  }
  return [...pages.values()];
}

export async function analyzeProjectPages(projectRoot, { sourceIndex }) {
  const configPath = 'src/pages.json';
  let configText;
  try {
    configText = await readFile(join(projectRoot, configPath), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return analyzeVueRouterPages(sourceIndex);
    throw error;
  }
  const registrations = registeredPages(literalValue(parseExpression(configText)));
  const files = new Map(sourceIndex.files.map(file => [file.filePath, file]));
  return registrations.map(({ route, name }) => {
    const filePath = `src/${route}.vue`;
    const file = files.get(filePath);
    if (!file) throw new Error(`注册页面未进入源码索引：${filePath}`);
    return pageAsset(file, { name, route: `/${route}` }, configPath, configText, [
      '页面清单汇总跨平台注册声明，未判定当前构建平台是否启用。',
    ]);
  });
}
