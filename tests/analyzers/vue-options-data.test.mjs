import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {buildFrontendSourceIndex} from '../../dist/analyzers/frontend-source-index.js';
async function attributes(script,template='<Panel :params="filterParams" :unknown="remote" />') {
 const root=await mkdtemp(join(tmpdir(),'vibe-options-data-'));
 try {await writeFile(join(root,'Page.vue'),`<script>${script}</script><template>${template}</template>`);return (await buildFrontendSourceIndex(root,['.'])).files[0].componentCalls.map(c=>c.attributes);}finally{await rm(root,{recursive:true,force:true});}
}
test('Options API data uses individual static initializer values without executing dynamic siblings',async()=>{
 assert.deepEqual(await attributes(`export default { data(){ return {filterParams:{skills:[],distance:'',count:-1},remote:load()} } }`),[[{name:'params',value:{skills:[],distance:'',count:-1}},{name:'unknown',dynamic:true}]]);
});
test('does not infer methods, computed, side effects, spreads or shadowed template bindings',async()=>{
 for(const script of [
 `export default {computed:{filterParams(){return {}}}}`,
 `export default {data(){doWork();return {filterParams:{}}}}`,
 `export default {data(){return {...other,filterParams:{}}}}`,
 `export default {...other,data(){return {filterParams:{}}}}`,
 `export default {async data(){return {filterParams:{}}}}`
 ]) assert.equal((await attributes(script))[0][0].dynamic,true);
 const script=`export default {data(){return {filterParams:{a:1}}}}`;
 assert.equal((await attributes(script,'<div v-for="filterParams in rows"><Panel :params="filterParams" /></div>'))[0][0].dynamic,true);
 assert.equal((await attributes(script,'<Panel v-slot="filterParams"><Child :params="filterParams" /></Panel>'))[1][0].dynamic,true);
});
