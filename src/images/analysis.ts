export const imageSchemaVersion='0.1.0';

export function fields(value,required,label) {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || required.some(key=>!Object.hasOwn(value,key)) || Object.keys(value).some(key=>!required.includes(key))) throw new Error(`图片 ${label} 字段缺失或未知。`);
}
function text(value,label) {
  if(typeof value!=='string' || !value.trim()) throw new Error(`图片 ${label} 字段必须为非空文本。`);
}
function array(value,label) {if(!Array.isArray(value)) throw new Error(`图片 ${label} 字段必须为数组。`);}
function unique(values,label) {if(new Set(values).size!==values.length) throw new Error(`图片 ${label} 不能重复。`);}
export function validateImageDigest(value) {
  if(typeof value!=='string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('图片摘要必须为 64 位小写 SHA-256。');
}
export function validateImageAnalysis(analysis,image) {
  fields(analysis,['schemaVersion','sourceDigest','title','description','observations','inferences','prompts','tags'],'analysis');
  if(analysis.schemaVersion!==imageSchemaVersion) throw new Error('不支持的图片分析协议版本。');
  validateImageDigest(analysis.sourceDigest);
  if(analysis.sourceDigest!==image.digest) throw new Error('图片分析与原图摘要不匹配。');
  text(analysis.title,'title');text(analysis.description,'description');
  for(const field of ['observations','inferences','prompts','tags']) array(analysis[field],field);
  if(!analysis.observations.length) throw new Error('图片至少需要一条视觉观察。');
  for(const observation of analysis.observations) {
    fields(observation,['aspect','text','evidence'],'observation');text(observation.text,'observation.text');
    if(!['subject','composition','color','lighting','material','style','medium','mood','purpose'].includes(observation.aspect)) throw new Error('图片观察 aspect 字段无效。');
    const evidence=observation.evidence;
    if(evidence?.scope==='whole-image') fields(evidence,['scope'],'evidence');
    else if(evidence?.scope==='region') {
      fields(evidence,['scope','x','y','width','height'],'evidence');
      if(!['x','y','width','height'].every(key=>Number.isSafeInteger(evidence[key])) || evidence.x<0 || evidence.y<0 || evidence.width<1 || evidence.height<1
        || evidence.x+evidence.width>image.width || evidence.y+evidence.height>image.height) throw new Error('图片观察区域必须为原图范围内的有效像素坐标。');
    } else throw new Error('图片观察证据必须为全图或区域。');
  }
  for(const inference of analysis.inferences) {
    fields(inference,['text','basedOn','uncertainty'],'inference');text(inference.text,'inference.text');text(inference.uncertainty,'inference.uncertainty');array(inference.basedOn,'inference.basedOn');
    if(!inference.basedOn.length || inference.basedOn.some(index=>!Number.isSafeInteger(index) || index<0 || index>=analysis.observations.length)) throw new Error('图片推断必须引用有效观察下标。');
    unique(inference.basedOn,'推断依据');
  }
  for(const prompt of analysis.prompts) {
    fields(prompt,['targetModel','prompt','verification'],'prompt');text(prompt.targetModel,'prompt.targetModel');text(prompt.prompt,'prompt.prompt');
    if(prompt.verification!=='unverified') throw new Error('图片候选提示词必须明确为 unverified，尚未执行效果验证。');
  }
  if(!analysis.prompts.some(prompt=>prompt.targetModel==='generic')) throw new Error('图片至少需要一条 generic 通用候选提示词。');
  unique(analysis.prompts.map(prompt=>prompt.targetModel),'提示词目标模型');
  for(const tag of analysis.tags) text(tag,'tag');
  unique(analysis.tags,'标签');
}
