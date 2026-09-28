export const creatorWorkbenchJs=String.raw`
function creatorWorkbenchHtml() {
  return '<details class="learning-panel"><summary>B 站账号样本炼化</summary><p>导入宿主实际采集的主页与作品清单，保留采样时间、缺失项和字幕状态。标题与简介不能代替视频内容。</p><form id="creator-prepare-form"><label>采集清单 JSON<textarea name="capture" class="learning-long" required aria-label="账号采集清单 JSON"></textarea></label><button type="submit">校验并准备账号任务</button></form><p id="creator-message" role="status"></p><pre id="creator-coverage"></pre><form id="creator-analysis-form"><label>确切任务 ID<input name="taskId" required></label><label>宿主分析 JSON<textarea name="analysis" class="learning-long" required></textarea></label><button type="submit">校验证据并导入账号知识</button></form></details>';
}
function bindCreatorWorkbench() {
  const prepare=byId('creator-prepare-form');
  const analysis=byId('creator-analysis-form');
  const message=byId('creator-message');
  let pending=false;
  const setPending=value=>{
    pending=value;
    for(const form of [prepare,analysis]){
      form.inert=value;
      form.querySelector('button').disabled=value;
    }
  };
  const request=async(path,input)=>{
    const response=await fetch('/api/creators/'+path,{method:'POST',headers:{'content-type':'application/json','x-vibe-import-token':document.querySelector('meta[name="vibe-import-token"]').content},body:JSON.stringify(input)});
    const value=await response.json();if(!response.ok)throw new Error(value.message);return value;
  };
  prepare.onsubmit=async event=>{
    event.preventDefault();if(pending)return;setPending(true);message.textContent='正在校验材料…';
    try {
      const result=await request('prepare',JSON.parse(prepare.elements.namedItem('capture').value));
      if(byId('creator-prepare-form')!==prepare)return;
      analysis.elements.namedItem('taskId').value=result.task.id;
      byId('creator-coverage').textContent=JSON.stringify({coverage:result.coverage,limitations:result.limitations},null,2);
      learningTaskDetail(result.task);message.textContent='采集材料已冻结，复制任务交给宿主分析；尚未生成结论。';
    }catch(error){if(byId('creator-prepare-form')===prepare)message.textContent=error.message;}
    finally{setPending(false);}
  };
  analysis.onsubmit=async event=>{
    event.preventDefault();if(pending)return;setPending(true);
    try{
      const result=await request('analysis',{taskId:analysis.elements.namedItem('taskId').value,analysis:JSON.parse(analysis.elements.namedItem('analysis').value)});
      if(byId('creator-analysis-form')!==analysis)return;
      message.textContent='已校验并导入 '+result.assets.length+' 项账号知识。';window.dispatchEvent(new Event('vibe-import-complete'));
    }catch(error){if(byId('creator-analysis-form')===analysis)message.textContent=error.message;}
    finally{setPending(false);}
  };
}
function renderCreatorDetails(asset) {
  const creator=asset.raw?.creator;if(!creator)return '';
  return '<section class="learning-panel"><h3>账号采样依据</h3><p>'+escapeHtml(creator.account.name)+' · '+escapeHtml(creator.collectedAt)+'</p><a href="'+escapeHtml(creator.account.url)+'" target="_blank" rel="noreferrer">查看 B 站主页</a><p>作品 '+creator.coverage.works+' 项，有字幕 '+creator.coverage.transcripts+' 项。</p><p>'+escapeHtml(creator.sampling.method)+'</p><ul>'+creator.limitations.map(value=>'<li>'+escapeHtml(value)+'</li>').join('')+'</ul>'+creator.entries.map(entry=>'<details><summary>'+escapeHtml(entry.id)+'</summary><pre>'+escapeHtml(entry.text)+'</pre></details>').join('')+'</section>';
}
`;
