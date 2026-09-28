const variableName=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function promptFields(value,required,optional=[]) {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || required.some(key=>!Object.hasOwn(value,key)) || Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key))) throw new Error('提示词字段缺失或包含未知字段。');
}
export function promptText(value,label,max) {
  if(typeof value!=='string' || !value.trim() || value.length>max || value.includes('\0')) throw new Error(`提示词 ${label} 必须为非空文本，长度不超过 ${max} 字符。`);
}
// Parse once; variable values are never fed back through this parser.
export function parsePromptTemplate(template) {
  promptText(template,'template',64000);
  const tokens=[];
  let literal='';
  for(let index=0;index<template.length;) {
    if(template.startsWith('\\{{',index)||template.startsWith('\\}}',index)) {literal+=template.slice(index+1,index+3);index+=3;continue;}
    if(template.startsWith('}}',index)) throw new Error('提示词变量括号未配对；字面双括号请使用反斜杠转义。');
    if(!template.startsWith('{{',index)) {literal+=template[index++];continue;}
    const end=template.indexOf('}}',index+2);
    if(end<0) throw new Error('提示词变量缺少结束括号。');
    const name=template.slice(index+2,end);
    if(!variableName.test(name)) throw new Error('提示词变量名只接受英文字母、数字、下划线，不能含空格且不能数字开头。');
    if(literal) {tokens.push({text:literal});literal='';}
    tokens.push({name});index=end+2;
  }
  if(literal) tokens.push({text:literal});
  return tokens;
}
export function validatePromptContent(content) {
  promptFields(content,['title','description','targetModel','template','variables','sourceAssetIds']);
  promptText(content.title,'title',160);promptText(content.description,'description',4000);promptText(content.targetModel,'targetModel',160);
  const tokens=parsePromptTemplate(content.template);
  if(!Array.isArray(content.variables) || content.variables.length>64) throw new Error('提示词变量声明必须为数组，最多 64 项。');
  const names=[];
  for(const variable of content.variables) {
    promptFields(variable,['name','description']);
    if(typeof variable.name!=='string'||!variableName.test(variable.name)) throw new Error('提示词变量名称无效。');
    promptText(variable.description,'变量说明',1000);names.push(variable.name);
  }
  if(new Set(names).size!==names.length) throw new Error('提示词变量声明不能重复。');
  const used=new Set(tokens.filter(token=>token.name!==undefined).map(token=>token.name));
  if(names.length!==used.size || names.some(name=>!used.has(name))) throw new Error('提示词变量声明必须与模板占位符完全一致。');
  if(!Array.isArray(content.sourceAssetIds)||content.sourceAssetIds.length>10) throw new Error('提示词来源必须为最多 10 个资产 ID 的数组。');
  for(const id of content.sourceAssetIds) promptText(id,'来源 ID',1000);
  if(new Set(content.sourceAssetIds).size!==content.sourceAssetIds.length) throw new Error('提示词来源资产不能重复。');
  return tokens;
}
export function renderPromptTemplate(content,values) {
  const tokens=validatePromptContent(content),names=content.variables.map(variable=>variable.name);
  try {promptFields(values,names);} catch {throw new Error('提示词变量值缺失或包含未知变量。');}
  for(const name of names) promptText(values[name],'变量 '+name,64000);
  const text=tokens.map(token=>token.name===undefined?token.text:values[token.name]).join('');
  if(Buffer.byteLength(text,'utf8')>256*1024) throw new Error('提示词渲染结果大小超过 256 KiB，请减少变量内容或重复引用。');
  return text;
}
