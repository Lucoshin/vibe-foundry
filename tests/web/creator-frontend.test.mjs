import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { creatorWorkbenchJs } from '../../dist/web/creator-frontend.js';

function workbench() {
  const fields={capture:{value:JSON.stringify({account:'A'})},taskId:{value:'task-A'},analysis:{value:'{}'}};
  const form=()=>({inert:false,elements:{namedItem:name=>fields[name]},querySelector:()=>({disabled:false})});
  const prepare=form(),analysis=form(),message={textContent:''},coverage={textContent:''};
  const elements={'creator-prepare-form':prepare,'creator-analysis-form':analysis,'creator-message':message,'creator-coverage':coverage};
  const requests=[],shown=[],events=[];
  const context=vm.createContext({
    byId:id=>elements[id],document:{querySelector:()=>({content:'token'})},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),
    learningTaskDetail:task=>shown.push(task),window:{dispatchEvent:event=>events.push(event.type)},Event:class{constructor(type){this.type=type;}}
  });
  vm.runInContext(creatorWorkbenchJs+';bindCreatorWorkbench();',context);
  const submit=target=>target.onsubmit({preventDefault(){}});
  const respond=(index,ok=true)=>requests[index].resolve({ok,json:async()=>ok?{task:{id:'task-A'},coverage:{works:1},limitations:[],assets:[{}]}:{message:'真实校验失败'}});
  return {prepare,analysis,message,coverage,elements,requests,shown,events,submit,respond,fields};
}

for(const operation of ['prepare','analysis']) {
  test(`账号 ${operation} 期间共同锁定材料和分析表单，拒绝重复或交叉提交`,async()=>{
    const page=workbench();
    const pending=page.submit(page[operation]);
    assert.equal(page.prepare.inert,true);
    assert.equal(page.analysis.inert,true);
    await page.submit(page.prepare);
    await page.submit(page.analysis);
    assert.equal(page.requests.length,1);
    page.respond(0);await pending;
    assert.equal(page.prepare.inert,false);
    assert.equal(page.analysis.inert,false);
    assert.equal(operation==='prepare'?page.shown.length:page.events.length,1);
  });

  test(`账号 ${operation} 失败后恢复两表单，可重试`,async()=>{
    const page=workbench();const pending=page.submit(page[operation]);
    page.respond(0,false);await pending;
    assert.equal(page.message.textContent,'真实校验失败');
    assert.equal(page.prepare.inert,false);assert.equal(page.analysis.inert,false);
    const retry=page.submit(page[operation]);assert.equal(page.requests.length,2);
    page.respond(1);await retry;
  });

  test(`账号 ${operation} 完成时已切页，不更新新页面和任务`,async()=>{
    const page=workbench();const pending=page.submit(page[operation]);
    const newPrepare={inert:true},newAnalysis={inert:true},newMessage={textContent:'新页面'};
    page.elements['creator-prepare-form']=newPrepare;
    page.elements['creator-analysis-form']=newAnalysis;
    page.elements['creator-message']=newMessage;
    page.respond(0);await pending;
    assert.equal(page.shown.length,0);assert.equal(page.events.length,0);
    assert.equal(newMessage.textContent,'新页面');
    assert.equal(newPrepare.inert,true);assert.equal(newAnalysis.inert,true);
  });
}

test('JSON 解析失败也释放共同锁定，不发送请求',async()=>{
  const page=workbench();page.fields.capture.value='{';
  await page.submit(page.prepare);
  assert.equal(page.requests.length,0);
  assert.equal(page.prepare.inert,false);assert.equal(page.analysis.inert,false);
  assert.notEqual(page.message.textContent,'正在校验材料…');
});
