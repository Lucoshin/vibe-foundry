import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const keyName = node => node?.name ?? node?.value;
const property = (node, name) => node?.properties?.find(item => item.type === 'ObjectProperty' && !item.computed && keyName(item.key) === name)?.value;

function boundNames(node, names = new Set()) {
  if (!node) return names;
  if (node.type === 'Identifier') names.add(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach(item => boundNames(item.value ?? item.argument, names));
  else if (node.type === 'ArrayPattern') node.elements.forEach(item => boundNames(item, names));
  else if (node.type === 'AssignmentPattern') boundNames(node.left, names);
  else if (node.type === 'RestElement') boundNames(node.argument, names);
  return names;
}

function callbackBindings(node) {
  const names = new Set();
  for (const parameter of node.params) boundNames(parameter, names);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'VariableDeclarator') boundNames(value.id, names);
    if (value.type === 'FunctionDeclaration' || value.type === 'ClassDeclaration') boundNames(value.id, names);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child?.type) visit(child);
    }
  }
  visit(node.body);
  return names;
}

function configObject(program, imports) {
  let node = program.body.find(item => item.type === 'ExportDefaultDeclaration')?.declaration;
  if (node?.type === 'CallExpression') {
    const binding = imports.get(node.callee?.name);
    if (binding?.source !== 'vite' || binding.imported !== 'defineConfig' || node.arguments.length !== 1) return null;
    node = node.arguments[0];
  }
  const shadowed = new Set();
  if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node?.type)) {
    for (const name of callbackBindings(node)) shadowed.add(name);
    if (node.body.type === 'BlockStatement') {
      const returns = node.body.body.filter(item => item.type === 'ReturnStatement');
      if (returns.length !== 1) return null;
      node = returns[0].argument;
    } else node = node.body;
  }
  if (node?.type === 'TSAsExpression') node = node.expression;
  return node?.type === 'ObjectExpression' ? { node, shadowed } : null;
}

function staticReplacement(node, imports, shadowed, projectRoot, configPath, urlShadowed) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier' || shadowed.has(node.callee.name)) return null;
  const binding = imports.get(node.callee.name);
  if (['node:path', 'path'].includes(binding?.source) && binding.imported === 'resolve' && node.arguments.length > 0 && node.arguments.every(item => item.type === 'StringLiteral')) {
    return resolve(projectRoot, ...node.arguments.map(item => item.value));
  }
  if (!['node:url', 'url'].includes(binding?.source) || binding.imported !== 'fileURLToPath' || node.arguments.length !== 1 || urlShadowed || shadowed.has('URL')) return null;
  const url = node.arguments[0];
  if (url.type !== 'NewExpression' || url.callee.type !== 'Identifier' || url.callee.name !== 'URL' || url.arguments.length !== 2 || url.arguments[0].type !== 'StringLiteral') return null;
  const base = url.arguments[1];
  if (base.type !== 'MemberExpression' || base.computed || base.property.name !== 'url' || base.object.type !== 'MetaProperty' || base.object.meta.name !== 'import' || base.object.property.name !== 'meta') return null;
  const value = new URL(url.arguments[0].value, pathToFileURL(resolve(projectRoot, configPath)));
  return value.protocol === 'file:' ? fileURLToPath(value) : null;
}

// Read only statically proven replacements; never import or execute a project config.
export async function discoverProjectAliases(projectRoot, readSource, { sourceIndex } = {}) {
  for (const configPath of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) {
    const source = await readSource(configPath);
    if (!source) continue;
    const program = parse(source, { sourceType: 'module', plugins: ['typescript'] }).program;
    const imports = new Map();
    let urlShadowed = false;
    for (const statement of program.body) {
      if (statement.type === 'ImportDeclaration') {
        for (const specifier of statement.specifiers) {
          imports.set(specifier.local.name, { source: statement.source.value, imported: keyName(specifier.imported) });
          if (specifier.local.name === 'URL') urlShadowed = true;
        }
      }
      if (statement.type === 'VariableDeclaration' && statement.declarations.some(item => boundNames(item.id).has('URL'))) urlShadowed = true;
      if (statement.id?.name === 'URL') urlShadowed = true;
    }
    const config = configObject(program, imports);
    const object = property(property(config?.node, 'resolve'), 'alias');
    const aliases = [];
    if (object?.type === 'ObjectExpression' && object.properties.every(item => item.type === 'ObjectProperty' && !item.computed)) {
      const values = new Map();
      for (const item of object.properties) {
        const replacement = staticReplacement(item.value, imports, config.shadowed, projectRoot, configPath, urlShadowed);
        const find = keyName(item.key);
        if (typeof find === 'string') values.set(find, replacement);
      }
      for (const [find, replacement] of values) if (replacement !== null) aliases.push({ find, replacement });
    }
    const evidence = [{ filePath: configPath, digest: createHash('sha256').update(source).digest('hex') }];
    const indexed = new Map((sourceIndex?.files ?? []).map(file => [file.filePath, file]));
    const pending = aliases.filter(item => isAbsolute(item.replacement)).map(item => relative(projectRoot, item.replacement).replaceAll('\\', '/'));
    const seen = new Set();
    while (pending.length) {
      const filePath = pending.shift();
      if (seen.has(filePath) || filePath.startsWith('../') || isAbsolute(filePath)) continue;
      seen.add(filePath);
      if (!/\.(?:[cm]?[jt]sx?|vue|json|css)$/.test(filePath)) continue;
      const text = await readSource(filePath);
      if (text) evidence.push({ filePath, digest: createHash('sha256').update(text).digest('hex') });
      for (const dependency of indexed.get(filePath)?.dependencies ?? []) if (dependency.resolvedFilePath) pending.push(dependency.resolvedFilePath);
    }
    return { aliases, evidence };
  }
  return { aliases: [], evidence: [] };
}
