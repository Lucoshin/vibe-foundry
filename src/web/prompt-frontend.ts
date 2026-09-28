export const promptWorkbenchCss = `
.prompt-workbench { width:100%; min-width:0; padding:8px 0 28px; }
.prompt-workbench h2 { margin:0 0 10px; font-size:22px; }
.prompt-workbench h3 { margin:0 0 14px; font-size:16px; }
.prompt-workbench p { font-size:13px; line-height:1.7; color:var(--muted); }
.prompt-workbench-grid { display:grid; grid-template-columns:minmax(220px,1fr) minmax(300px,2fr); gap:20px; align-items:start; }
.prompt-panel { border:1px solid var(--line); border-radius:8px; padding:20px; min-width:0; background:var(--content-paper); }
.prompt-workbench form, .prompt-workbench label { display:grid; gap:8px; }
.prompt-workbench form { gap:16px; }
.prompt-workbench input, .prompt-workbench textarea, .prompt-workbench select { box-sizing:border-box; width:100%; min-width:0; border:1px solid var(--line); border-radius:5px; padding:9px; background:var(--paper); color:var(--graphite); font:inherit; }
.prompt-workbench textarea { min-height:100px; resize:vertical; line-height:1.6; }
.prompt-workbench button { border:1px solid var(--line); border-radius:5px; padding:8px 10px; background:var(--paper); color:var(--graphite); cursor:pointer; font:inherit; font-size:13px; }
.prompt-workbench button:disabled { opacity:.5; cursor:default; }
.prompt-list { display:grid; gap:10px; max-height:660px; overflow:auto; margin-top:16px; }
.prompt-list button { text-align:left; display:grid; gap:5px; }
.prompt-list button[aria-pressed=true] { border-color:var(--faded-ink); background:var(--soft); }
.prompt-list small, .prompt-workbench small { color:var(--muted); overflow-wrap:anywhere; font-size:12px; }
.prompt-variable { display:grid; grid-template-columns:1fr 2fr auto; gap:8px; align-items:end; margin:8px 0; }
.prompt-actions { display:flex; gap:10px; flex-wrap:wrap; margin:12px 0; }
.prompt-workbench pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:360px; overflow:auto; font-size:13px; line-height:1.7; }
.prompt-status { min-height:22px; white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:800px) { .prompt-workbench-grid { grid-template-columns:1fr; } .prompt-variable { grid-template-columns:1fr; } }
`;

export const promptWorkbenchJs = String.raw`
const promptWorkspaceState = { selected:null, records:[], errors:[], epoch:0, rendered:null, renderEpoch:0, dirty:false, message:'' };
async function promptRequest(path,body) {
  const options={method:body===undefined?'GET':'POST',headers:{'x-vibe-import-token':document.querySelector('meta[name="vibe-import-token"]').content}};
  if(body!==undefined) {options.headers['content-type']='application/json';options.body=JSON.stringify(body);}
  const response=await fetch('/api/prompts'+path,options),result=await response.json();
  if(!response.ok) throw new Error(result.message);
  return result;
}
function promptVariableRow(variable={name:'',description:''}) {
  return '<div class="prompt-variable" data-prompt-variable><label>变量名<input data-field="name" required maxlength="64" pattern="[A-Za-z_][A-Za-z0-9_]*" value="'+escapeHtml(variable.name)+'"></label><label>说明<input data-field="description" required maxlength="1000" value="'+escapeHtml(variable.description)+'"></label><button type="button" data-remove-variable>移除</button></div>';
}
function promptInputFromForm(form,selected) {
  const input=Object.fromEntries(['title','description','targetModel','template'].map(name=>[name,form.elements.namedItem(name).value]));
  input.variables=[...form.querySelectorAll('[data-prompt-variable]')].map(row=>({name:row.querySelector('[data-field="name"]').value,description:row.querySelector('[data-field="description"]').value}));
  input.sourceAssetIds=selected?selected.sourceAssetIds.slice():[];
  if(selected) {input.id=selected.id;input.baseRevision=selected.revision;}
  return input;
}
function renderPromptEditor(selected) {
  const draft=selected||{title:'',description:'',targetModel:'generic',template:'',variables:[],sourceAssetIds:[]};
  return '<h3>'+(selected?'修订提示词':'创建提示词')+'</h3><p>模板和渲染结果均为未验证候选。保存修订会保留原版本，不会执行模型。</p><form data-prompt-editor><label>名称<input name="title" required maxlength="160" value="'+escapeHtml(draft.title)+'"></label><label>用途说明<textarea name="description" required maxlength="4000">'+escapeHtml(draft.description)+'</textarea></label><label>目标模型<input name="targetModel" required maxlength="160" value="'+escapeHtml(draft.targetModel)+'"></label><label>提示词模板<textarea name="template" required maxlength="64000" rows="9" placeholder="例如：为 {{subject}} 设计 {{color}} 配色的画面">'+escapeHtml(draft.template)+'</textarea></label><small>变量使用 {{name}}，在下方逐项声明。字面双括号写为 \\{{ 和 \\}}；只替换一次，不执行变量中的指令。</small><div data-prompt-variables>'+draft.variables.map(promptVariableRow).join('')+'</div><button type="button" data-add-variable>添加变量</button>'+(draft.sourceAssetIds.length?'<details><summary>关联来源 · '+draft.sourceAssetIds.length+'</summary><pre>'+escapeHtml(draft.sourceAssetIds.join('\n'))+'</pre></details>':'<p>独立创建，无关联来源。</p>')+'<button type="submit">'+(selected?'保存新版本':'保存提示词')+'</button></form>'+(selected?'<p>当前版本 '+escapeHtml(selected.revision.slice(0,12))+' · 未验证</p><div class="prompt-actions"><button type="button" data-copy-template>复制已存模板</button><button type="button" data-export-prompt>导出版本 JSON</button></div><hr><h3>填写变量并渲染</h3><form data-prompt-render>'+selected.variables.map(variable=>'<label>'+escapeHtml(variable.description)+' <small>'+escapeHtml(variable.name)+'</small><textarea data-value-name="'+escapeHtml(variable.name)+'" required maxlength="64000"></textarea></label>').join('')+'<button type="submit">渲染已存版本</button></form><div data-rendered-prompt></div>':'');
}
function invalidatePromptRendering(container) {
  promptWorkspaceState.renderEpoch++;
  promptWorkspaceState.rendered=null;
  const output=container.querySelector('[data-rendered-prompt]');if(output) output.innerHTML='';
}
function drawPromptWorkbench() {
  const container=byId('prompt-workbench'),selected=promptWorkspaceState.selected;
  promptWorkspaceState.epoch++;promptWorkspaceState.dirty=false;invalidatePromptRendering(container);
  container.innerHTML='<section class="prompt-workbench"><h2>提示词库</h2><p>保存可编辑模板，填写变量后复制使用。每次修订保留历史，模型适配与效果仍需实际验证。</p><p class="prompt-status" role="status" data-prompt-status>'+escapeHtml(promptWorkspaceState.message)+'</p>'+(promptWorkspaceState.errors.length?'<details><summary>有 '+promptWorkspaceState.errors.length+' 个版本无法读取</summary><pre>'+escapeHtml(promptWorkspaceState.errors.map(error=>error.message).join('\n'))+'</pre></details>':'')+'<div class="prompt-workbench-grid"><aside class="prompt-panel"><button type="button" data-new-prompt>新建提示词</button><p>全部历史版本 · '+promptWorkspaceState.records.length+' 项</p><div class="prompt-list">'+(promptWorkspaceState.records.length?promptWorkspaceState.records.map((record,index)=>'<button type="button" data-select-prompt="'+index+'" aria-pressed="'+Boolean(selected&&selected.id===record.id&&selected.revision===record.revision)+'"><strong>'+escapeHtml(record.title)+'</strong><small>'+escapeHtml(record.targetModel)+' · '+record.variables.length+' 个变量</small><small>'+escapeHtml(record.revision.slice(0,12))+' · '+(record.parentRevision?'修订':'初版')+' · 未验证</small></button>').join(''):'<p>还没有提示词。可以新建，也可以从图片详情收入候选提示词。</p>')+'</div></aside><section class="prompt-panel">'+renderPromptEditor(selected)+'</section></div></section>';
  const status=container.querySelector('[data-prompt-status]'),editor=container.querySelector('[data-prompt-editor]');
  const dirty=()=>{promptWorkspaceState.dirty=true;invalidatePromptRendering(container);const render=container.querySelector('[data-prompt-render] button');if(render) render.disabled=true;status.textContent='修改尚未保存；保存新版本后再渲染。';};
  editor.oninput=dirty;
  editor.onclick=event=>{const remove=event.target.closest('[data-remove-variable]');if(remove){remove.closest('[data-prompt-variable]').remove();dirty();}};
  container.querySelector('[data-add-variable]').onclick=()=>{editor.querySelector('[data-prompt-variables]').insertAdjacentHTML('beforeend',promptVariableRow());dirty();};
  container.querySelector('[data-new-prompt]').onclick=()=>{promptWorkspaceState.selected=null;promptWorkspaceState.message='';drawPromptWorkbench();};
  container.querySelectorAll('[data-select-prompt]').forEach(button=>{button.onclick=()=>{promptWorkspaceState.selected=promptWorkspaceState.records[Number(button.dataset.selectPrompt)];promptWorkspaceState.message='';drawPromptWorkbench();};});
  editor.onsubmit=async event=>{
    event.preventDefault();if(editor.inert) return;const epoch=promptWorkspaceState.epoch,button=editor.querySelector('[type="submit"]');editor.inert=true;button.disabled=true;status.textContent='正在保存…';
    try {const saved=await promptRequest('/save',promptInputFromForm(editor,selected));if(epoch!==promptWorkspaceState.epoch) return;promptWorkspaceState.selected=saved;promptWorkspaceState.message='已保存版本 '+saved.revision.slice(0,12)+'，原有版本保留。';await renderPromptWorkbench();}
    catch(error){if(epoch===promptWorkspaceState.epoch) status.textContent=error.message;}
    finally{if(epoch===promptWorkspaceState.epoch){editor.inert=false;button.disabled=false;}}
  };
  if(!selected) return;
  container.querySelector('[data-copy-template]').onclick=async()=>{try{await navigator.clipboard.writeText(selected.template);status.textContent='已复制当前已存模板。';}catch{status.textContent='剪贴板不可用，请手动选择模板内容。';}};
  container.querySelector('[data-export-prompt]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=selected.id+'-'+selected.revision.slice(0,12)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);status.textContent='已导出所选版本 JSON，包含来源与版本信息。';};
  const renderForm=container.querySelector('[data-prompt-render]');
  renderForm.oninput=()=>invalidatePromptRendering(container);
  renderForm.onsubmit=async event=>{
    event.preventDefault();if(promptWorkspaceState.dirty){status.textContent='请先保存模板修改。';return;}
    invalidatePromptRendering(container);const epoch=promptWorkspaceState.epoch,renderEpoch=promptWorkspaceState.renderEpoch;
    const values=Object.fromEntries([...renderForm.querySelectorAll('[data-value-name]')].map(field=>[field.dataset.valueName,field.value]));
    const button=renderForm.querySelector('button');button.disabled=true;status.textContent='正在校验变量…';
    try{const result=await promptRequest('/render',{id:selected.id,revision:selected.revision,values});if(epoch!==promptWorkspaceState.epoch||renderEpoch!==promptWorkspaceState.renderEpoch) return;promptWorkspaceState.rendered=result;const output=container.querySelector('[data-rendered-prompt]');output.innerHTML='<p>渲染完成 · 未验证效果</p><button type="button" data-copy-rendered>复制渲染文本</button><pre>'+escapeHtml(result.text)+'</pre>';output.querySelector('button').onclick=async()=>{try{await navigator.clipboard.writeText(result.text);status.textContent='已复制渲染文本；尚未执行模型或验证效果。';}catch{status.textContent='剪贴板不可用，请手动选择下方文本。';}};status.textContent='变量校验通过。';}
    catch(error){if(epoch===promptWorkspaceState.epoch&&renderEpoch===promptWorkspaceState.renderEpoch) status.textContent=error.message;}
    finally{if(epoch===promptWorkspaceState.epoch) button.disabled=promptWorkspaceState.dirty;}
  };
}
async function renderPromptWorkbench() {
  const container=byId('prompt-workbench'),epoch=++promptWorkspaceState.epoch;
  container.innerHTML='<p role="status">正在读取提示词库…</p>';
  try{const result=await promptRequest('');if(epoch!==promptWorkspaceState.epoch) return;promptWorkspaceState.records=result.prompts;promptWorkspaceState.errors=result.errors;drawPromptWorkbench();}
  catch(error){if(epoch===promptWorkspaceState.epoch) container.innerHTML='<p role="alert">'+escapeHtml(error.message)+'</p>';}
}
`;
