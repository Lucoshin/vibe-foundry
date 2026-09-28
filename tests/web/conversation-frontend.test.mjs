import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
const escapeHtml = value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('conversation frontend makes selection and host execution explicit and escapes memory evidence',async()=>{
  const {conversationWorkbenchJs} = await import('../../dist/web/conversation-frontend.js');
  const context = vm.createContext({escapeHtml});
  vm.runInContext(conversationWorkbenchJs,context);
  const html = vm.runInContext('conversationWorkbenchHtml()',context);
  assert.match(html,/预览.*选择/);
  assert.match(html,/宿主/);
  assert.match(html,/messages/);
  context.preview = {source:{entries:[{id:'u1',role:'user',text:'<script>bad</script>'}]},coverage:{inputEntries:1,selectedEntries:1,omittedEntries:0},limitations:['片段']};
  const selected = vm.runInContext('conversationPreviewHtml(preview)',context);
  assert.match(selected,/data-conversation-message/);
  assert.match(selected,/&lt;script&gt;/);
  context.memory = {asset:{id:'learning:exact',title:'知识'},evidence:[{entryId:'u1',role:'user',quote:'<script>quote</script>'}],applications:[{target:'真实任务',reason:'适用条件',action:'执行动作',outcome:'未验证',verification:'user-declared',evidence:[]}],revisions:[],relations:[],limitations:['其他版本不自动取代']};
  const memory = vm.runInContext('conversationMemoryHtml(memory)',context);
  assert.match(memory,/适用条件/);assert.match(memory,/未验证/);assert.match(memory,/&lt;script&gt;quote/);
  assert.doesNotMatch(memory,/<script>/);
  assert.equal(vm.runInContext("renderLearningMemoryAction({id:'image:one'})",context),'');
});

test('changing selected messages while preparation is pending cannot display the old task as the new selection',async()=>{
  const {conversationWorkbenchJs} = await import('../../dist/web/conversation-frontend.js');
  const previewButton = {}, prepare = {}, status = {textContent:''};
  let checked = [{value:'u1'},{value:'u2'}], resolvePreparation, openedTask;
  const output = {innerHTML:'',querySelectorAll:()=>checked};
  const fields = {title:{value:'会话'},format:{value:'messages'},material:{value:JSON.stringify([{id:'u1',role:'user',text:'一'},{id:'u2',role:'user',text:'二'}])}};
  const form = {elements:{namedItem:name=>fields[name]},querySelector:()=>previewButton};
  const panel = {querySelector:selector=>({'[data-conversation-form]':form,'[data-conversation-preview]':output,'[data-conversation-status]':status,'[data-conversation-prepare]':prepare}[selector])};
  const context = vm.createContext({escapeHtml,byId:()=>panel,learningTaskDetail:task=>openedTask=task,window:{dispatchEvent(){}},Event:class{}});
  vm.runInContext(conversationWorkbenchJs,context);
  context.request = async path=>path==='preview'?{source:{entries:JSON.parse(fields.material.value)},coverage:{inputEntries:2,selectedEntries:2,omittedEntries:0},limitations:[]}:new Promise(resolve=>resolvePreparation=resolve);
  vm.runInContext('conversationRequest=request; bindConversationWorkbench();',context);
  await form.onsubmit({preventDefault(){}});
  const pending = prepare.onclick();
  checked = [{value:'u2'}];
  output.onchange?.();
  status.textContent = '新选择';
  resolvePreparation({task:{id:'old-task'},coverage:{selectedEntries:2,omittedEntries:0}});
  await pending;
  assert.equal(openedTask,undefined);
  assert.equal(status.textContent,'新选择');
  assert.equal(prepare.disabled,false);
});

test('editing raw material while its preview is pending discards the stale response',async()=>{
  const {conversationWorkbenchJs} = await import('../../dist/web/conversation-frontend.js');
  const previewButton = {}, prepare = {}, status = {textContent:''}, output = {innerHTML:''};
  const fields = {title:{value:'会话'},format:{value:'text'},material:{value:'旧材料'}};
  const form = {elements:{namedItem:name=>fields[name]},querySelector:()=>previewButton};
  const panel = {querySelector:selector=>({'[data-conversation-form]':form,'[data-conversation-preview]':output,'[data-conversation-status]':status,'[data-conversation-prepare]':prepare}[selector])};
  let resolvePreview;
  const context = vm.createContext({escapeHtml,byId:()=>panel,request:()=>new Promise(resolve=>resolvePreview=resolve)});
  vm.runInContext(conversationWorkbenchJs,context);
  vm.runInContext('conversationRequest=request; bindConversationWorkbench();',context);
  const pending = form.onsubmit({preventDefault(){}});
  fields.material.value='新材料';form.oninput();
  resolvePreview({source:{entries:[{id:'text-1',role:'document',text:'旧材料'}]},coverage:{inputEntries:1,selectedEntries:1,omittedEntries:0},limitations:[]});
  await pending;
  assert.equal(output.innerHTML,'');assert.equal(prepare.disabled,true);assert.equal(previewButton.disabled,false);
});
