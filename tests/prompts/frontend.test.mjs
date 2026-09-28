import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Script,createContext } from 'node:vm';
import test from 'node:test';
import { analysisFor,png } from '../images/fixtures.mjs';
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
async function frontend(){
  assert.ok(existsSync(new URL('../../dist/web/prompt-frontend.js',import.meta.url)),'提示词和图片编辑前端尚未实现');
  const {promptWorkbenchJs}=await import('../../dist/web/prompt-frontend.js');
  const {imageEditJs}=await import('../../dist/web/image-edit-frontend.js');
  const context=createContext({escapeHtml});new Script(promptWorkbenchJs+'\n'+imageEditJs+'\nglobalThis.testFns={promptInputFromForm,imagePromptDraft,renderImageEditButton,renumberImageReferences,renderPromptEditor,imageAnalysisFromForm};').runInContext(context);return context.testFns;
}
test('图片候选提升为独立模板保留精确来源并把原有双括号作为字面文本',async()=>{
  const api=await frontend(),analysis=analysisFor(png());analysis.prompts[0].prompt='画面标签 {{unknown}}';
  const asset={id:'image:exact-version',name:'<img src=x onerror=alert(1)>',category:'images',raw:analysis};
  const draft=api.imagePromptDraft(asset,0);assert.deepEqual(JSON.parse(JSON.stringify(draft.sourceAssetIds)),[asset.id]);assert.equal(draft.template,'画面标签 \\{{unknown\\}}');assert.equal(draft.variables.length,0);
  assert.doesNotMatch(api.renderImageEditButton(asset),/<img src=x/);assert.match(api.renderImageEditButton(asset),/保存/);
});
test('在线表单原样保留含逗号和换行的既有标签，不拆分改写',async()=>{
  const {imageAnalysisFromForm}=await frontend(),raw=analysisFor();raw.tags=['冷色,静谧','光\n影'];
  const values={title:raw.title,description:raw.description,tags:raw.tags.join(', ')};
  const form={elements:{namedItem:name=>({value:values[name]})},querySelectorAll:selector=>selector==='[data-image-tag]'?raw.tags.map(value=>({value})):[]};
  assert.deepEqual(JSON.parse(JSON.stringify(imageAnalysisFromForm(form,raw).tags)),raw.tags);
});
test('删除观察重新编号引用但移除已删除依据，不默默绑定到另一条观察',async()=>{
  const {renumberImageReferences}=await frontend();assert.equal(renumberImageReferences('1, 3, 4',1),'2, 3');assert.equal(renumberImageReferences('2',2),'');assert.equal(renumberImageReferences('1, 2',3),'1, 2');
});
test('提示词编辑表单保留父版本与来源，展示内容转义',async()=>{
  const {promptInputFromForm,renderPromptEditor}=await frontend();
  const selected={id:'prompt-abc',revision:'revision',sourceAssetIds:['image:exact'],title:'<script>x</script>',description:'描述',targetModel:'generic',template:'内容',variables:[]};
  const values={title:'新标题',description:'新描述',targetModel:'generic',template:'主题{{subject}}'};
  const form={elements:{namedItem:name=>({value:values[name]})},querySelectorAll:()=>[{querySelector:selector=>({value:selector.includes('name')?'subject':'主体'})}]};
  const input=promptInputFromForm(form,selected);assert.equal(input.id,selected.id);assert.equal(input.baseRevision,selected.revision);assert.equal(input.template,values.template);assert.deepEqual(JSON.parse(JSON.stringify(input.sourceAssetIds)),selected.sourceAssetIds);
  const html=renderPromptEditor(selected);assert.doesNotMatch(html,/<script>x/);assert.match(html,/未验证/);assert.match(html,/保存新版本/);assert.ok(html.includes('\\{{'),'用户应能看到字面括号转义的反斜杠');
});

test('模板保存过程中锁定编辑表单，避免请求返回覆盖继续输入的内容',async()=>{
  const {promptWorkbenchJs}=await import('../../dist/web/prompt-frontend.js');
  const submit={disabled:false},status={textContent:''};
  const input={title:'测试',description:'说明',targetModel:'generic',template:'无变量'};
  const editor={elements:{namedItem:name=>({value:input[name]})},querySelector:()=>submit,querySelectorAll:()=>[]};
  const elements={'[data-prompt-status]':status,'[data-prompt-editor]':editor,'[data-add-variable]':{},'[data-new-prompt]':{}};
  const container={innerHTML:'',querySelector:selector=>elements[selector]||null,querySelectorAll:()=>[]};
  let requests=0;
  const context=createContext({escapeHtml,byId:()=>container,document:{querySelector:()=>({content:'token'})},fetch:()=>{requests++;return new Promise(()=>{});}});
  new Script(promptWorkbenchJs+'\ndrawPromptWorkbench();').runInContext(context);
  editor.onsubmit({preventDefault(){}});
  assert.equal(editor.inert,true);
  editor.onsubmit({preventDefault(){}});
  assert.equal(requests,1);
});
