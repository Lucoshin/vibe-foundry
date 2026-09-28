import { parse } from '@babel/parser';
import { createHash } from 'node:crypto';
import { dirname, posix } from 'node:path';

const keyName = (node) => node?.type === 'Identifier' ? node.name : node?.value;
function memberPath(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' && !node.computed) return `${memberPath(node.object)}.${keyName(node.property)}`;
  return '';
}
function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => visit(item, callback));
    else if (value?.type) visit(value, callback);
  }
}
function hasBinding(ast, name, allowedModule) {
  return ast.body.some((statement) => {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node?.type === 'VariableDeclaration') return node.declarations.some((item) => item.id.name === name);
    if (node?.id?.name === name) return true;
    return node?.type === 'ImportDeclaration' && node.specifiers.some((item) => item.local.name === name)
      && node.source.value !== allowedModule;
  });
}
function exportsName(ast, name) {
  return ast.body.some((node) => node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && (
    node.specifiers.some((item) => keyName(item.exported) === name)
    || node.declaration?.declarations?.some((item) => item.id.name === name)
  )));
}

// This intentionally recognises a build contract, not arbitrary executable Vite configuration.
export async function discoverUniPlatformDefine(readSource) {
  const evidence = new Map();
  async function load(filePath) {
    const source = await readSource(filePath);
    if (!source) return null;
    evidence.set(filePath, source);
    try { return parse(source, { sourceType: 'module', plugins: ['typescript'] }).program; }
    catch { return null; }
  }
  async function resolveModule(from, specifier) {
    if (!specifier.startsWith('.')) return null;
    const base = posix.normalize(posix.join(dirname(from).replaceAll('\\', '/'), specifier));
    if (base.startsWith('../')) return null;
    for (const candidate of /\.(?:ts|js)$/.test(base) ? [base] : [`${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`]) {
      const ast = await load(candidate);
      if (ast) return { filePath: candidate, ast };
    }
    return null;
  }
  async function isUniPlatform(filePath, ast, name, seen = new Set()) {
    const identity = `${filePath}:${name}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    for (const statement of ast.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
        const variable = declaration.declarations.find((item) => item.id.type === 'Identifier' && item.id.name === name);
        if (variable) return !hasBinding(ast, 'process', 'node:process') && memberPath(variable.init) === 'process.env.UNI_PLATFORM';
      }
      if (statement.type === 'ImportDeclaration') {
        const binding = statement.specifiers.find((item) => item.type === 'ImportSpecifier' && item.local.name === name);
        if (binding) {
          const imported = await resolveModule(filePath, statement.source.value);
          return imported && exportsName(imported.ast, keyName(binding.imported)) ? isUniPlatform(imported.filePath, imported.ast, keyName(binding.imported), seen) : false;
        }
      }
      if (statement.type === 'ExportAllDeclaration' || (statement.type === 'ExportNamedDeclaration' && statement.source)) {
        const binding = statement.specifiers?.find((item) => keyName(item.exported) === name);
        if (statement.type !== 'ExportAllDeclaration' && !binding) continue;
        const imported = await resolveModule(filePath, statement.source.value);
        const importedName = binding ? keyName(binding.local) : name;
        if (imported && exportsName(imported.ast, importedName) && await isUniPlatform(imported.filePath, imported.ast, importedName, seen)) return true;
      }
    }
    return false;
  }
  for (const filePath of ['vite.config.ts', 'vite.config.js']) {
    const ast = await load(filePath);
    if (!ast || hasBinding(ast, 'JSON')) continue;
    const candidates = [];
    visit(ast, (node) => {
      if (node.type !== 'ObjectProperty' || node.computed || keyName(node.key) !== 'define' || node.value.type !== 'ObjectExpression') return;
      for (const property of node.value.properties) {
        if (property.type !== 'ObjectProperty' || property.computed || keyName(property.key) !== 'PLATFORM') continue;
        const value = property.value;
        if (value.type === 'CallExpression' && memberPath(value.callee) === 'JSON.stringify' && value.arguments.length === 1 && value.arguments[0].type === 'Identifier') candidates.push(value.arguments[0].name);
      }
    });
    if (candidates.length === 1 && await isUniPlatform(filePath, ast, candidates[0])) {
      return { value: 'h5', evidence: [...evidence].map(([filePath, source]) => ({ filePath, digest: createHash('sha256').update(source).digest('hex') })) };
    }
  }
  return null;
}
