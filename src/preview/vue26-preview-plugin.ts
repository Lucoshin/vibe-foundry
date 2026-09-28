import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parse, compileTemplate, compileStyle } from '@vue/component-compiler-utils';
import { preprocessCSS, transformWithEsbuild } from 'vite';
import { parse as parseScript } from '@babel/parser';
import { assertPreviewDependencies } from './preview-dependencies.js';

export function resolveVue26Path(projectRoot) {
  const fromProject=createRequire(join(projectRoot,'package.json'));
  try {
    const webpackPackage=fromProject.resolve('webpack/package.json');
    if(!/^4\./.test(fromProject(webpackPackage).version)) return null;
    const fromWebpack=createRequire(webpackPackage);
    const mappedPath=fromWebpack('node-libs-browser').path;
    if(typeof mappedPath!=='string' || !isAbsolute(mappedPath)) return null;
    return fromWebpack.resolve(mappedPath);
  } catch(error) {
    if(error.code==='MODULE_NOT_FOUND') return null;
    throw error;
  }
}

export async function transformVue26Script(source, filename, lang, fromProject) {
  if (lang && !['js', 'jsx', 'ts'].includes(lang)) throw new Error('暂未适配 Vue 2.6 脚本语言：'+lang);
  if (lang === 'ts') return (await transformWithEsbuild(source,filename+'.ts',{loader:'ts'})).code;
  const ast = parseScript(source, {sourceType:'module',plugins:['jsx']});
  function containsJsx(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true;
    return Object.values(node).some(child => Array.isArray(child) ? child.some(containsJsx) : child?.type && containsJsx(child));
  }
  if (!containsJsx(ast)) return source;
  // Vue CLI's Vue 2 branch uses this exact preset. Keep ESM and avoid executing
  // the source Babel config (whose development branch rewrites import()).
  const babel = fromProject('@babel/core');
  const preset = fromProject('@vue/babel-preset-jsx');
  const output = await babel.transformAsync(source, {
    filename, babelrc:false, configFile:false, sourceType:'module', presets:[preset],
  });
  return output.code;
}

// Only the static Vue 2.6 SFC transform lives here. Vite owns CSS/assets and bundling.
export function vue26PreviewPlugin(projectRoot) {
  assertPreviewDependencies(projectRoot, 'vite-vue');
  const fromProject = createRequire(join(projectRoot, 'package.json'));
  const compiler = fromProject(fromProject.resolve('vue-template-compiler/build'));
  const descriptors = new Map();
  let config;
  function parts(id) { const [filename, query] = id.split('?'); return {filename,query:new URLSearchParams(query)}; }
  function descriptor(source, filename) {
    const result = parse({source,filename,compiler,needMap:false});
    if (result.script?.attrs.setup !== undefined) throw new Error('Vue 2.6 不支持 script setup；请使用源项目支持的编译插件。');
    if (result.customBlocks.length) throw new Error('组件包含尚未适配的自定义 SFC 区块：'+filename);
    descriptors.set(filename,result);
    return result;
  }
  return {
    name:'vibe-vue26-sfc',
    enforce:'pre',
    configResolved(value) { config=value; },
    resolveId(id) {
      if (id.includes('?vibe-vue26=')) return id;
      if (id==='path') return resolveVue26Path(projectRoot);
    },
    async load(id) {
      const {filename,query}=parts(id);
      if (!query.has('vibe-vue26')) return null;
      const sfc=descriptors.get(filename);
      if (query.get('vibe-vue26')==='script') {
        const script=sfc.script;
        return transformVue26Script(script.content,filename,script.lang,fromProject);
      }
      const style=sfc.styles[Number(query.get('index'))];
      if (style.module) throw new Error('Vue 2.6 CSS Modules 尚未适配：'+filename);
      const styleFile=style.src ? resolve(dirname(filename),style.src) : filename;
      const content=style.src ? await readFile(styleFile,'utf8') : style.content;
      const prepared=style.lang && style.lang!=='css' ? await preprocessCSS(content,styleFile+'.'+style.lang,config) : {code:content};
      const output=compileStyle({source:prepared.code,filename:styleFile,id:query.get('scope'),scoped:!!style.scoped});
      if (output.errors.length) throw new Error(output.errors.join('\n'));
      return output.code;
    },
    async transform(source,id) {
      if (!id.endsWith('.vue')) return null;
      const sfc=descriptor(source,id);
      const scope='data-v-'+createHash('sha256').update(id).digest('hex').slice(0,8);
      const script=sfc.script;
      const lines=[script ? 'import __component from '+JSON.stringify(script.src || id+'?vibe-vue26=script')+';' : 'const __component = {};'];
      if (sfc.template) {
        const template=sfc.template;
        const templateFile=template.src ? resolve(dirname(id),template.src) : id;
        const compiled=compileTemplate({source:template.src ? await readFile(templateFile,'utf8') : template.content,filename:templateFile,compiler,preprocessLang:template.lang,isFunctional:!!template.attrs.functional,isProduction:true,prettify:false,transformAssetUrls:true});
        if (compiled.errors.length) throw new Error(compiled.errors.map(e=>typeof e==='string'?e:e.msg).join('\n'));
        const assets=[];
        const code=compiled.code.replace(/require\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)/g,(_,literal)=>{
          const name='__asset'+assets.length;
          assets.push('import '+name+' from '+literal+';');
          return name;
        });
        lines.push(...assets,code,'const options = typeof __component === "function" ? __component.options : __component;','options.render = render; options.staticRenderFns = staticRenderFns; options._compiled = true;');
        if (template.attrs.functional) lines.push('options.functional = true;');
        if (sfc.styles.some(s=>s.scoped)) lines.push('options._scopeId = '+JSON.stringify(scope)+';');
      }
      sfc.styles.forEach((_,index)=>lines.push('import '+JSON.stringify(id+'?vibe-vue26=style&index='+index+'&scope='+scope+'&lang.css')+';'));
      lines.push('export default __component;');
      return {code:lines.join('\n'),map:null};
    },
  };
}
