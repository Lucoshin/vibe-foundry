import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parse as parseScript, parseExpression } from '@babel/parser';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => { const value = relative(root, path); return value !== '..' && !value.startsWith('../') && !value.startsWith('..\\') && !value.includes(':'); };
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','start','end','extra','comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
function references(file) {
  const urls = new Set();
  const limitations = [];
  const add = value => { if (typeof value === 'string' && value.startsWith('/static/') && !value.endsWith('/')) urls.add(value.split(/[?#]/)[0]); };
  const literals = node => walk(node, item => {
    if (item.type === 'StringLiteral') add(item.value);
    if (item.type === 'TemplateLiteral' && item.quasis.some(part => part.value.raw.includes('/static/'))) {
      if (!item.expressions.length) add(item.quasis[0].value.cooked);
      else limitations.push(`动态静态资源路径未解析：${file.filePath}`);
    }
  });
  const style = text => {
    for (let i=0;i<text.length;) {
      if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+2;continue;}
      if(text.startsWith('//',i)){const end=text.indexOf('\n',i+2);i=end<0?text.length:end+1;continue;}
      const match=text.slice(i).match(/^url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/);
      if(match){add(match[1]??match[2]??match[3]);i+=match[0].length;continue;}
      if(text[i]==='"'||text[i]==="'"){const quote=text[i++];while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]===quote)break;}continue;}
      i++;
    }
  };
  if (file.filePath.endsWith('.vue')) {
    const {descriptor, errors} = parseSfc(file.sourceText, {filename:file.filePath,templateParseOptions:{isVoidTag:tag=>['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','image'].includes(tag)}});
    if (errors.length) return {urls,limitations:[`静态资源分析无法解析源码：${file.filePath}`]};
    if (descriptor.template) {
      const template = parseTemplate(descriptor.template.content, {isVoidTag:tag=>['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','image'].includes(tag)});
      walk(template, node => {
        if (node.type !== NodeTypes.ELEMENT || !['image','img','video','audio','source','track'].includes(node.tag)) return;
        for (const prop of node.props) {
          if (prop.type === NodeTypes.ATTRIBUTE && ['src','poster'].includes(prop.name)) add(prop.value?.content);
          if (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && ['src','poster'].includes(prop.arg?.content) && prop.exp) literals(parseExpression(prop.exp.content));
        }
      });
    }
    descriptor.styles.forEach(block => style(block.content));
    for (const block of [descriptor.script,descriptor.scriptSetup].filter(Boolean)) literals(parseScript(block.content,{sourceType:'module',plugins:['typescript','jsx'],errorRecovery:true}));
  } else if (/\.[cm]?[jt]sx?$/.test(file.filePath)) literals(parseScript(file.sourceText,{sourceType:'module',plugins:['typescript','jsx'],errorRecovery:true}));
  else if (/\.(css|scss|sass|less)$/.test(file.filePath)) style(file.sourceText);
  return {urls,limitations};
}

async function resourceBytes(projectRoot, item) {
  if (!/^static\/(?:[^/]+\/)*[^/]+$/.test(item.publicPath) || item.publicPath.split('/').some(part=>part==='.'||part==='..'||part.includes('\\')) || item.filePath !== 'src/' + item.publicPath) throw new Error('无效的 uni 静态资源路径。');
  const root = await realpath(projectRoot);
  const file = await realpath(resolve(root,item.filePath));
  if (!inside(resolve(root,'src/static'),file) || !inside(root,file) || !(await stat(file)).isFile()) throw new Error(`静态资源不是工程内常规文件：${item.filePath}`);
  return readFile(file);
}

export async function collectUniStaticResources(projectRoot, component, sourceIndex) {
  const files = new Map(sourceIndex.files.map(file=>[file.filePath,file]));
  const visited = new Set();
  const pending = [component.filePath];
  const urls = new Set();
  const limitations = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    let file = files.get(path);
    if (!file && /\.(css|scss|less)$/.test(path)) {
      const root = await realpath(projectRoot);
      const fullPath = await realpath(resolve(root,path));
      if (!inside(root,fullPath) || !(await stat(fullPath)).isFile()) throw new Error(`样式来源不是工程内常规文件：${path}`);
      file = {filePath:path,sourceText:await readFile(fullPath,'utf8'),dependencies:[]};
    }
    if (!file) continue;
    const refs = references(file);
    refs.urls.forEach(url=>urls.add(url));
    refs.limitations.forEach(item=>limitations.add(item));
    for (const dependency of file.dependencies ?? []) if (dependency.resolvedFilePath) pending.push(dependency.resolvedFilePath);
  }
  const resources = [];
  for (const url of [...urls].sort()) {
    const item = {publicPath:url.slice(1),filePath:'src'+url};
    try { const bytes=await resourceBytes(projectRoot,item); resources.push({...item,bytes:bytes.length,sha256:digest(bytes)}); }
    catch (error) { if(error.code!=='ENOENT') throw error; limitations.add(`静态资源缺失：${item.filePath}`); }
  }
  return {resources,limitations:[...limitations].sort()};
}

export async function writeUniStaticResources(projectRoot, previewRoot, resources) {
  for (const item of resources) {
    const bytes = await resourceBytes(projectRoot,item);
    if (digest(bytes)!==item.sha256 || bytes.length!==item.bytes) throw new Error(`静态资源已变化，请重新炼化：${item.filePath}`);
    const output = resolve(previewRoot,'public',item.publicPath);
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,bytes);
  }
}
