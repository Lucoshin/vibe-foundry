import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {parse} from '@babel/parser';

const comparePath=(a,b)=>a.filePath<b.filePath?-1:a.filePath>b.filePath?1:0;
const fingerprint=source=>createHash('sha256').update(source).digest('hex');

function componentSource(filePath,source) {
  if(/\.(vue|jsx|tsx)$/i.test(filePath)) return true;
  if(!/\.[jt]s$/i.test(filePath)) return false;
  function containsJsx(node) {
    if(!node || typeof node!=='object') return false;
    if(node.type==='JSXElement' || node.type==='JSXFragment') return true;
    return Object.values(node).some(child=>Array.isArray(child)?child.some(containsJsx):child?.type && containsJsx(child));
  }
  try { return containsJsx(parse(source,{sourceType:'module',plugins:['jsx',...(/\.ts$/i.test(filePath)?['typescript']:[])]})); }
  catch(error) { if(error instanceof SyntaxError) return false; throw error; }
}

export function deduplicateComponents(components,sourceIndex,mode) {
  if(mode!=='merge-identical') return components;
  const indexed=new Map((sourceIndex?.files??[]).map(file=>[file.filePath,file]));
  const groups=new Map();
  const output=[];
  for(const component of [...components].sort(comparePath)) {
    const file=indexed.get(component.filePath);
    const source=file?.sourceText;
    if(component.kind!=='component' || typeof source!=='string' || source.length===0 || !componentSource(component.filePath,source) || !Array.isArray(file.dependencies) || file.dependencies.some(dependency=>!dependency.resolvedFilePath)) {
      output.push(component);
      continue;
    }
    const dependencies=file.dependencies.map(({source,resolvedFilePath})=>[source,resolvedFilePath]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    // Relative references may occur in templates, CSS, runtime strings or comments.
    // Matching import resolution alone cannot prove equivalence across directories.
    const pathContext = source.includes('./') || /\b(?:src|href|poster)\s*[:=]|\burl\s*\(|import\s*\.\s*meta\b|\b__(?:dirname|filename)\b/.test(source);
    const relativeScope=pathContext ? posix.dirname(component.filePath.replaceAll('\\','/')) : '';
    const sourceFingerprint=fingerprint(source);
    const key=JSON.stringify([source,dependencies,relativeScope,component.exportMode,component.exportName]);
    const existing=groups.get(key);
    if(!existing) {
      const item={...component};
      groups.set(key,item);
      output.push(item);
      continue;
    }
    const duplicateSources=[...(existing.duplicateSources??[]),{filePath:component.filePath,name:component.name,sourceFingerprint},...(component.duplicateSources??[])];
    existing.duplicateSources=[...new Map(duplicateSources.map(item=>[item.filePath,item])).values()].sort(comparePath);
    const scenarios=new Map((existing.scenarios??[]).map(scenario=>[scenario.id,scenario]));
    for(const scenario of component.scenarios??[]) if(!scenarios.has(scenario.id)) scenarios.set(scenario.id,scenario);
    existing.scenarios=[...scenarios.values()];
    if(existing.analysisEvidence) existing.analysisEvidence={...existing.analysisEvidence,scenarioCount:existing.scenarios.length};
  }
  return output;
}
