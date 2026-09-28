import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const hooks=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/src/preview/vue26-preview-plugin.ts') && specifier==='./preview-dependencies.js') return next('./preview-dependencies.ts',context);
  return next(specifier,context);
}});
const {transformVue26Script,resolveVue26Path}=await import('../../src/preview/vue26-preview-plugin.ts');
hooks.deregister();

test('Vue2 JSX uses the source Babel compiler and Vue JSX preset while preserving ES modules',async()=>{
 const preset={name:'source-vue-jsx'};let received;
 const require=id=>{
   if(id==='@vue/babel-preset-jsx')return preset;
   if(id==='@babel/core')return {transformAsync:async(code,options)=>{received={code,options};return {code:'compiled render(h)'}}};
   throw new Error('unexpected module '+id);
 };
 const code="import Badge from './Badge'; export default {render(h){return <sup class='badge'>{this.count}</sup>}}";
 assert.equal(await transformVue26Script(code,'Item.vue','js',require),'compiled render(h)');
 assert.equal(received.code,code);assert.deepEqual(received.options.presets,[preset]);
 assert.equal(received.options.babelrc,false);assert.equal(received.options.configFile,false);
 assert.equal(received.options.sourceType,'module');
});

test('ordinary JS and JSX-looking strings do not require an optional JSX compiler',async()=>{
 const source="export default {text:'<sup>badge</sup>'}";
 assert.equal(await transformVue26Script(source,'Plain.vue','js',()=>{throw new Error('must not resolve compiler')}),source);
 await assert.rejects(transformVue26Script('export default <sup/>','Broken.vue','js',()=>{throw new Error('missing source compiler')}),/missing source compiler/);
});

test('path resolution reuses only the source webpack4 exact node-libs-browser mapping',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vue26-path-'));
 try {
  await writeFile(join(root,'package.json'),'{}');
  assert.equal(resolveVue26Path(root),null);
  for(const version of ['4.47.0','5.0.0']) {
   const project=join(root,version);const modules=join(project,'node_modules');
   await mkdir(join(modules,'webpack'),{recursive:true});await mkdir(join(modules,'node-libs-browser'));
   await writeFile(join(project,'package.json'),'{}');await writeFile(join(modules,'webpack/package.json'),JSON.stringify({version}));
   const implementation=join(modules,'actual-path.cjs');await writeFile(implementation,'module.exports={resolve(){}}');
   await writeFile(join(modules,'node-libs-browser/index.js'),'exports.path='+JSON.stringify(implementation));
   assert.equal(resolveVue26Path(project),version.startsWith('4.')?implementation:null);
  }
 }finally {await rm(root,{recursive:true,force:true})}
});
