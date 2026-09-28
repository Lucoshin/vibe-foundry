export const imageEditCss = `
.image-edit-actions { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0; }
.image-edit-actions button, .image-editor button { border:1px solid var(--line); border-radius:5px; padding:8px 10px; background:var(--paper); color:var(--graphite); font:inherit; font-size:13px; cursor:pointer; }
.image-editor { box-sizing:border-box; width:min(860px,94vw); max-height:90vh; overflow:auto; padding:24px; border:1px solid var(--line); border-radius:10px; background:var(--content-paper); color:var(--graphite); }
.image-editor::backdrop { background:rgba(30,30,30,.45); }
.image-editor h2 { margin:0 0 8px; font-size:20px; }.image-editor h3 { margin:22px 0 12px; font-size:16px; }
.image-editor p { font-size:13px; line-height:1.7; color:var(--muted); }
.image-editor form,.image-editor label { display:grid; gap:8px; }.image-editor fieldset { border:0; margin:0; padding:0; min-width:0; }
.image-editor label { font-size:13px; margin:10px 0; }
.image-editor input,.image-editor select,.image-editor textarea { box-sizing:border-box; width:100%; min-width:0; border:1px solid var(--line); border-radius:5px; padding:9px; background:var(--paper); color:var(--graphite); font:inherit; }
.image-editor textarea { min-height:76px; resize:vertical; line-height:1.6; }
.image-edit-row { padding:16px; margin:12px 0; border:1px solid var(--line); border-radius:7px; }
.image-region-fields { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }.image-region-fields[hidden] { display:none; }
.image-editor .image-editor-actions { display:flex; gap:10px; margin-top:20px; }.image-editor [role=status] { white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:600px) { .image-editor { padding:16px; }.image-region-fields { grid-template-columns:1fr 1fr; } }
`;

export const imageEditJs = String.raw`
const imageEditAspects={subject:'主体',composition:'构图',color:'色彩',lighting:'光照',material:'材质',style:'风格特征',medium:'媒介',mood:'氛围',purpose:'用途线索'};
function renderImageEditButton(asset) {
  if(asset.category!=='images') return '';
  return '<div class="image-edit-actions"><button type="button" data-edit-image="'+escapeHtml(asset.id)+'">编辑并保存新版本</button>'+asset.raw.prompts.map((prompt,index)=>'<button type="button" data-promote-image="'+escapeHtml(asset.id)+'" data-promote-index="'+index+'">收入提示词库 · '+escapeHtml(prompt.targetModel==='generic'?'通用':prompt.targetModel)+'</button>').join('')+'</div><p role="status" data-image-edit-status></p>';
}
function imagePromptDraft(asset,index) {
  const prompt=asset.raw.prompts[index];
  return {title:asset.name+' · '+prompt.targetModel,description:'来自图片「'+asset.name+'」的候选提示词，尚未验证生成效果。',targetModel:prompt.targetModel,template:prompt.prompt.replaceAll('{{','\\{{').replaceAll('}}','\\}}'),variables:[],sourceAssetIds:[asset.id]};
}
function imageObservationRow(item={aspect:'subject',text:'',evidence:{scope:'whole-image'}},index=0) {
  const region=item.evidence.scope==='region';
  return '<section class="image-edit-row" data-observation-row><strong data-observation-number>观察 '+(index+1)+'</strong><label>观察方向<select data-field="aspect">'+Object.entries(imageEditAspects).map(([value,label])=>'<option value="'+value+'"'+(item.aspect===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label>可见内容<textarea data-field="text" required>'+escapeHtml(item.text)+'</textarea></label><label>证据范围<select data-field="scope"><option value="whole-image"'+(!region?' selected':'')+'>全图</option><option value="region"'+(region?' selected':'')+'>原图区域</option></select></label><div class="image-region-fields" data-region-fields'+(!region?' hidden':'')+'>'+[['x','左'],['y','上'],['width','宽'],['height','高']].map(([key,label])=>'<label>'+label+'（像素）<input type="number" step="1" min="'+(key==='x'||key==='y'?0:1)+'" data-field="'+key+'" required value="'+(region?item.evidence[key]:'')+'"'+(!region?' disabled':'')+'></label>').join('')+'</div><button type="button" data-remove-observation>移除观察</button></section>';
}
function imageInferenceRow(item={text:'',basedOn:[],uncertainty:''}) {
  return '<section class="image-edit-row" data-inference-row><label>推断<textarea data-field="text" required>'+escapeHtml(item.text)+'</textarea></label><label>依据观察编号（从 1 开始，以逗号分隔）<input data-field="basedOn" required value="'+item.basedOn.map(index=>index+1).join(', ')+'"></label><label>不确定性<textarea data-field="uncertainty" required>'+escapeHtml(item.uncertainty)+'</textarea></label><button type="button" data-remove-inference>移除推断</button></section>';
}
function imageCandidateRow(item={targetModel:'generic',prompt:''}) {
  return '<section class="image-edit-row" data-candidate-row><label>目标模型<input data-field="targetModel" required value="'+escapeHtml(item.targetModel)+'"></label><label>候选提示词 · 未验证<textarea data-field="prompt" required rows="5">'+escapeHtml(item.prompt)+'</textarea></label><button type="button" data-remove-candidate>移除候选</button></section>';
}
function imageTagRow(tag='') {
  return '<div data-image-tag-row><label>标签<textarea data-image-tag required rows="1">'+escapeHtml(tag)+'</textarea></label><button type="button" data-remove-tag>移除标签</button></div>';
}
function renumberImageReferences(value,removedNumber) {
  const parts=value.split(/[,，]/).map(item=>item.trim());
  if(parts.some(item=>!/^\d+$/.test(item))) return value;
  return parts.map(Number).filter(number=>number!==removedNumber).map(number=>number>removedNumber?number-1:number).join(', ');
}
function imageAnalysisFromForm(form,raw) {
  const value=(row,field)=>row.querySelector('[data-field="'+field+'"]').value;
  return {schemaVersion:raw.schemaVersion,sourceDigest:raw.sourceDigest,title:form.elements.namedItem('title').value,description:form.elements.namedItem('description').value,
    tags:[...form.querySelectorAll('[data-image-tag]')].map(field=>field.value),
    observations:[...form.querySelectorAll('[data-observation-row]')].map(row=>({aspect:value(row,'aspect'),text:value(row,'text'),evidence:value(row,'scope')==='whole-image'?{scope:'whole-image'}:{scope:'region',...Object.fromEntries(['x','y','width','height'].map(key=>[key,Number(value(row,key))]))}})),
    inferences:[...form.querySelectorAll('[data-inference-row]')].map(row=>({text:value(row,'text'),uncertainty:value(row,'uncertainty'),basedOn:value(row,'basedOn').split(/[,，]/).map(part=>Number(part.trim())-1)})),
    prompts:[...form.querySelectorAll('[data-candidate-row]')].map(row=>({targetModel:value(row,'targetModel'),prompt:value(row,'prompt'),verification:'unverified'}))};
}
function openImageEditor(asset) {
  const raw=asset.raw,dialog=document.createElement('dialog');dialog.className='image-editor';dialog.setAttribute('aria-label','编辑图片分析');
  dialog.innerHTML='<h2>编辑图片分析</h2><p>原图保持不变，保存会生成新版本并保留历史。观察与推断分开，候选提示词仍未验证。</p><form><fieldset><label>标题<input name="title" required value="'+escapeHtml(asset.name)+'"></label><label>视觉摘要<textarea name="description" required>'+escapeHtml(raw.description)+'</textarea></label><h3>标签</h3><div data-image-tags>'+raw.tags.map(imageTagRow).join('')+'</div><button type="button" data-add-tag>添加标签</button><h3>视觉观察</h3><p>区域使用原始图片 '+raw.image.width+' × '+raw.image.height+' 像素坐标。</p><div data-observations>'+raw.observations.map(imageObservationRow).join('')+'</div><button type="button" data-add-observation>添加观察</button><h3>分析推断</h3><div data-inferences>'+raw.inferences.map(imageInferenceRow).join('')+'</div><button type="button" data-add-inference>添加推断</button><h3>候选提示词</h3><p>至少保留一个 generic 通用候选。目标模型名称不表示已验证兼容。</p><div data-candidates>'+raw.prompts.map(imageCandidateRow).join('')+'</div><button type="button" data-add-candidate>添加候选</button><div class="image-editor-actions"><button type="submit">保存新版本</button><button type="button" data-close-image-editor>取消</button></div></fieldset><p role="status" data-image-editor-status></p></form>';
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  const form=dialog.querySelector('form'),status=dialog.querySelector('[data-image-editor-status]');
  form.onchange=event=>{if(event.target.matches('[data-field="scope"]')){const row=event.target.closest('[data-observation-row]'),region=event.target.value==='region';row.querySelector('[data-region-fields]').hidden=!region;row.querySelectorAll('[data-region-fields] input').forEach(input=>{input.disabled=!region;});}};
  form.onclick=event=>{
    if(event.target.closest('[data-close-image-editor]')) dialog.close();
    if(event.target.closest('[data-add-observation]')) form.querySelector('[data-observations]').insertAdjacentHTML('beforeend',imageObservationRow(undefined,form.querySelectorAll('[data-observation-row]').length));
    if(event.target.closest('[data-add-inference]')) form.querySelector('[data-inferences]').insertAdjacentHTML('beforeend',imageInferenceRow());
    if(event.target.closest('[data-add-candidate]')) form.querySelector('[data-candidates]').insertAdjacentHTML('beforeend',imageCandidateRow({targetModel:'',prompt:''}));
    if(event.target.closest('[data-add-tag]')) form.querySelector('[data-image-tags]').insertAdjacentHTML('beforeend',imageTagRow());
    const removeTag=event.target.closest('[data-remove-tag]');if(removeTag) removeTag.closest('[data-image-tag-row]').remove();
    const removeObservation=event.target.closest('[data-remove-observation]');
    if(removeObservation){const row=removeObservation.closest('[data-observation-row]'),number=[...form.querySelectorAll('[data-observation-row]')].indexOf(row)+1;row.remove();form.querySelectorAll('[data-inference-row] [data-field="basedOn"]').forEach(input=>{input.value=renumberImageReferences(input.value,number);});form.querySelectorAll('[data-observation-number]').forEach((label,index)=>{label.textContent='观察 '+(index+1);});status.textContent='已同步观察编号并移除对已删观察的引用；请核对推断依据。';}
    const removeInference=event.target.closest('[data-remove-inference]');if(removeInference) removeInference.closest('[data-inference-row]').remove();
    const removeCandidate=event.target.closest('[data-remove-candidate]');if(removeCandidate) removeCandidate.closest('[data-candidate-row]').remove();
  };
  form.onsubmit=async event=>{
    event.preventDefault();const input={assetId:asset.id,analysis:imageAnalysisFromForm(form,raw)};const fieldset=form.querySelector('fieldset');fieldset.disabled=true;status.textContent='正在核验证据并保存…';
    try {const response=await fetch('/api/images/revisions',{method:'POST',headers:{'content-type':'application/json','x-vibe-import-token':document.querySelector('meta[name="vibe-import-token"]').content},body:JSON.stringify(input)});const saved=await response.json();if(!response.ok) throw new Error(saved.message);dialog.close();document.dispatchEvent(new CustomEvent('vibehub:image-revised',{detail:saved}));}
    catch(error){status.textContent=error.message;fieldset.disabled=false;}
  };
}
function bindImageEditActions(scope) {
  scope.querySelectorAll('[data-edit-image]').forEach(button=>{button.onclick=()=>openImageEditor(state.model.assets.find(asset=>asset.id===button.dataset.editImage));});
  scope.querySelectorAll('[data-promote-image]').forEach(button=>{button.onclick=async()=>{
    const asset=state.model.assets.find(item=>item.id===button.dataset.promoteImage),status=scope.querySelector('[data-image-edit-status]');button.disabled=true;
    try{const saved=await promptRequest('/save',imagePromptDraft(asset,Number(button.dataset.promoteIndex)));status.textContent='已收入提示词库：'+saved.title+'。可在提示词库中编辑变量和生成新版本。';}
    catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  };});
}
`;
