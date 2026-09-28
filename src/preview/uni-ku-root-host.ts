import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, isAbsolute } from 'node:path';
import { parse } from '@babel/parser';

const digest = text => createHash('sha256').update(text).digest('hex');

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(value => visit(value, fn));
    else if (child?.type) visit(child, fn);
  }
}

function hasDefaultInvocation(source) {
  const program = parse(source, { sourceType: 'module', plugins: ['typescript'] }).program;
  const names = new Set(program.body.filter(item => item.type === 'ImportDeclaration' && item.source.value === '@uni-ku/root')
    .flatMap(item => item.specifiers.filter(specifier => specifier.type === 'ImportDefaultSpecifier').map(specifier => specifier.local.name)));
  // A same-name parameter/declaration makes static binding ambiguous; do not enable it.
  visit(program, node => {
    const bindings = node.type === 'VariableDeclarator' ? [node.id] : node.params ?? [];
    for (const binding of bindings) visit(binding, identifier => {
      if (identifier.type === 'Identifier') names.delete(identifier.name);
    });
  });
  let invoked = false;
  visit(program, node => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || !names.has(node.callee.name)) return;
    if (node.arguments.length) throw new Error('UniKuRoot preview requires the source default plugin options; custom options are not supported.');
    invoked = true;
  });
  return invoked;
}

export async function discoverUniKuRootHost(projectRoot, readSource, { sourceIndex } = {}) {
  const evidence = [];
  for (const filePath of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs', 'build/vitePlugins.ts', 'build/vitePlugins.js']) {
    const source = await readSource(filePath);
    if (source && hasDefaultInvocation(source)) evidence.push({ filePath, digest: digest(source) });
  }
  if (!evidence.length) return null;
  const rootFile = 'src/App.ku.vue';
  if (!await readSource(rootFile)) throw new Error('Source UniKuRoot is enabled but src/App.ku.vue is missing.');
  const require = createRequire(resolve(projectRoot, 'package.json'));
  const sdkDigest = digest(await readFile(require.resolve('@uni-ku/root')));
  const indexed = new Map((sourceIndex?.files ?? []).map(file => [file.filePath, file]));
  const pending = [rootFile];
  const seen = new Set();
  while (pending.length) {
    const filePath = pending.shift();
    if (seen.has(filePath) || isAbsolute(filePath) || filePath.startsWith('../')) continue;
    seen.add(filePath);
    const source = await readSource(filePath);
    if (source) evidence.push({ filePath, digest: digest(source) });
    for (const dependency of indexed.get(filePath)?.dependencies ?? []) {
      if (dependency.resolvedFilePath) pending.push(dependency.resolvedFilePath);
    }
  }
  return { rootFile, evidence, sdkDigest };
}

// Construct only inside the preview build process, before Vite starts.
export function createUniKuRootPreviewPlugin(projectRoot, context) {
  if (!context) return null;
  const require = createRequire(resolve(projectRoot, 'package.json'));
  const factory = require('@uni-ku/root');
  const original = process.env.UNI_INPUT_DIR;
  try {
    process.env.UNI_INPUT_DIR = resolve(projectRoot, 'src');
    return factory();
  } finally {
    if (original === undefined) delete process.env.UNI_INPUT_DIR;
    else process.env.UNI_INPUT_DIR = original;
  }
}
