import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse, compileTemplate, compileStyle } from '@vue/component-compiler-utils';
import { preprocessCSS, transformWithEsbuild } from 'vite';
import { assertPreviewDependencies } from './preview-dependencies.js';

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
    resolveId(id) { if (id.includes('?vibe-vue26=')) return id; },
    async load(id) {
      const {filename,query}=parts(id);
      if (!query.has('vibe-vue26')) return null;
      const sfc=descriptors.get(filename);
      if (query.get('vibe-vue26')==='script') {
        const script=sfc.script;
        if (script.lang && !['js','ts'].includes(script.lang)) throw new Error('暂未适配 Vue 2.6 脚本语言：'+script.lang);
        return script.lang==='ts' ? (await transformWithEsbuild(script.content,filename+'.ts',{loader:'ts'})).code : script.content;
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
