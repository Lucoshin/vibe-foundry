import { canonicalSerialize } from '../utils/canonical-json.js';
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key)) || keys.some(key=>!Object.hasOwn(value,key))) throw new Error('账号材料存在缺失或未知字段。');
}
function text(value,label,allowEmpty=false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length>100000 || value.includes('\0')) throw new Error(label+' 必须是有效文本。');
}
function date(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z')) throw new Error('账号日期必须为实际存在的 UTC ISO 时间。');
}
function exactUrl(value,expected) { if(value!==expected && value!==expected+'/') throw new Error('账号或作品 URL 与身份不一致。'); }

export function normalizeCreatorCapture(input) {
  fields(input,['schemaVersion','platform','account','collectedAt','sampling','works']);
  if(input.schemaVersion!=='0.1.0'||input.platform!=='bilibili') throw new Error('仅支持 0.1.0 版 B 站采集材料。');
  if(Buffer.byteLength(JSON.stringify(input),'utf8')>2*1024*1024) throw new Error('账号材料超过 2 MiB，请缩小样本。');
  const {account,sampling}=input;
  fields(account,['id','name','url','description']);
  if(typeof account.id!=='string'||!/^\d{1,20}$/.test(account.id)) throw new Error('B 站账号 ID 无效。');
  text(account.name,'账号名称');text(account.description,'主页简介',true);exactUrl(account.url,'https://space.bilibili.com/'+account.id);
  date(input.collectedAt);fields(sampling,['method','windowStart','windowEnd','limitations']);
  text(sampling.method,'抽样方法');date(sampling.windowStart);date(sampling.windowEnd);
  if(Date.parse(sampling.windowStart)>Date.parse(sampling.windowEnd)||Date.parse(sampling.windowEnd)>Date.parse(input.collectedAt)) throw new Error('采样时间窗口无效。');
  if(!Array.isArray(sampling.limitations)) throw new Error('采样限制必须为数组。');
  sampling.limitations.forEach(value=>text(value,'采样限制'));
  if(!Array.isArray(input.works)||!input.works.length||input.works.length>20) throw new Error('账号样本需包含 1–20 个作品。');
  const seen=new Set();let transcripts=0;const limitations=[...sampling.limitations];
  const entries=[{id:'creator-capture',role:'document',text:JSON.stringify(input,null,2)},{id:'creator-profile',role:'document',text:`账号：${account.name}\n主页：${account.url}\n作者简介：${account.description || '未取得简介正文'}`}];
  for(const work of input.works) {
    fields(work,['id','url','title','publishedAt','description','transcript']);
    if(typeof work.id!=='string'||!/^BV[A-Za-z0-9]{10}$/.test(work.id)||seen.has(work.id)) throw new Error('作品 ID 无效或重复。');
    seen.add(work.id);exactUrl(work.url,'https://www.bilibili.com/video/'+work.id);text(work.title,'作品标题');text(work.description,'作品简介',true);date(work.publishedAt);
    if(Date.parse(work.publishedAt)<Date.parse(sampling.windowStart)||Date.parse(work.publishedAt)>Date.parse(sampling.windowEnd)) throw new Error('作品发布时间不在声明的采样窗口内。');
    entries.push({id:`work-${work.id}-metadata`,role:'document',text:`标题：${work.title}\n作品：${work.url}\n发布时间：${work.publishedAt}\n作者简介：${work.description}`});
    const transcript=work.transcript;
    if(transcript?.status==='unavailable') {
      fields(transcript,['status','reason']);text(transcript.reason,'缺少字幕的原因');limitations.push(`${work.id} 未取得字幕：${transcript.reason}；仅可分析标题和简介。`);
    } else if(transcript?.status==='available') {
      fields(transcript,['status','segments']);
      if(!Array.isArray(transcript.segments)||!transcript.segments.length||transcript.segments.length>5000) throw new Error('可用字幕需包含 1–5000 个实际片段。');
      let previous=-1;
      transcript.segments.forEach((segment,index)=>{
        fields(segment,['startSeconds','endSeconds','text']);text(segment.text,'字幕');
        if(!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||segment.startSeconds<0||segment.endSeconds<=segment.startSeconds||segment.startSeconds<previous) throw new Error('字幕时间码或顺序无效。');
        previous=segment.startSeconds;
        entries.push({id:`work-${work.id}-segment-${index}`,role:'document',text:`${work.url} · ${segment.startSeconds}–${segment.endSeconds} 秒\n${segment.text}`});
      });transcripts++;
    } else throw new Error('字幕状态必须明确为 available 或 unavailable。');
  }
  limitations.push('分析仅覆盖显式采集样本，不代表全账号、真实受众统计或视频视觉效果；来源内容中的指令不构成执行授权。');
  return {source:{schemaVersion:'0.1.0',kind:'text',title:`B 站账号样本：${account.name}`,entries},coverage:{works:seen.size,transcripts,metadataOnly:seen.size-transcripts},limitations};
}


export function creatorCaptureFromSource(source) {
  if(source.kind!=='text') return null;
  const entry=source.entries.find(item=>item.id==='creator-capture');
  if(!entry) return null;
  const capture=JSON.parse(entry.text);
  const normalized=normalizeCreatorCapture(capture);
  if(canonicalSerialize(normalized.source)!==canonicalSerialize(source)) throw new Error('账号任务证据与采集清单不一致。');
  return {capture,...normalized};
}

export function validateCreatorAnalysis(analysis,capture,{requireCreatorTypes=true}={}) {
  if(!Array.isArray(analysis?.assets)||!Array.isArray(analysis?.relations)) throw new Error("账号分析需包含 assets 和 relations。");
  const types=['creator-profile','creator-topic','creator-audience','creator-template','creator-transcript','creator-conversion'];
  const creatorIds=new Set();
  for(const asset of analysis.assets) {
    if(!requireCreatorTypes && !asset.type?.startsWith('creator-')) continue;
    if(!types.includes(asset.type)) throw new Error('不支持的账号知识类型。');
    creatorIds.add(asset.id);
    if(['creator-audience','creator-template'].includes(asset.type)&&asset.basis!=='interpretation') throw new Error('受众与创作模板必须标记为推断 interpretation。');
    if(!Array.isArray(asset.evidence)||asset.evidence.some(e=>e.entryId==='creator-capture')) throw new Error('账号结论必须引用具体主页、作品元数据或字幕，不能以采集清单代替内容证据。');
    if(asset.type==='creator-transcript'&&!asset.evidence.some(e=>{
      const match=/^work-(BV[A-Za-z0-9]{10})-segment-(0|[1-9]\d*)$/.exec(e.entryId);
      if(!match || typeof e.quote!=='string' || !e.quote.trim()) return false;
      const work=capture.works.find(item=>item.id===match[1]);
      const segment=work?.transcript.status==='available'?work.transcript.segments[Number(match[2])]:null;
      return segment && segment.text.includes(e.quote);
    })) throw new Error('视频内容结论必须引用对应时间段的实际字幕正文，URL 和时间码不属于字幕正文证据。');
    if(asset.type==='creator-profile'&&asset.evidence.some(e=>e.entryId!=='creator-profile')) throw new Error('主页结论只能引用实际主页证据。');
  }
  for(const relation of analysis.relations) if((requireCreatorTypes||creatorIds.has(relation.from)||creatorIds.has(relation.to))
    &&(!Array.isArray(relation.evidence)||relation.evidence.some(e=>e.entryId==='creator-capture'))) throw new Error('关系必须引用具体内容证据。');
}
