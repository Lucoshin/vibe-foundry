import {parse} from '@babel/parser';
import {parse as parseSfc} from '@vue/compiler-sfc';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';

function containsGlobalCloudCall(filePath, source) {
  if (/(?:^|\/)uniCloud(?:-[^/]+)?\/cloudfunctions\//.test(filePath.replaceAll('\\','/'))) return false;
  if (!source.includes('uniCloud')) return false;
  const scripts = filePath.endsWith('.vue')
    ? (()=>{const {descriptor}=parseSfc(source,{filename:filePath});return [descriptor.script?.content,descriptor.scriptSetup?.content].filter(Boolean)})()
    : [source];
  return scripts.some(script=>{
    let ast;
    try {ast=parse(script,{sourceType:'module',plugins:['typescript','jsx']});} catch{return false;}
    let call=false,local=false;
    function visit(node) {
      if(!node || typeof node!=='object')return;
      if((node.type==='VariableDeclarator' || node.type==='FunctionDeclaration' || node.type==='ClassDeclaration') && node.id?.name==='uniCloud')local=true;
      if(node.type?.startsWith('Import') && node.local?.name==='uniCloud')local=true;
      if(node.params?.some(param=>param.name==='uniCloud'))local=true;
      if((node.type==='CallExpression'||node.type==='OptionalCallExpression')
        && ['MemberExpression','OptionalMemberExpression'].includes(node.callee?.type)
        && node.callee.object?.type==='Identifier' && node.callee.object.name==='uniCloud')call=true;
      for(const [key,value] of Object.entries(node)) {
        if(['loc','comments','extra'].includes(key))continue;
        if(Array.isArray(value))value.forEach(visit);else if(value?.type)visit(value);
      }
    }
    visit(ast);return call&&!local;
  });
}

export async function discoverUniCloudHost(projectRoot, sources) {
  const matches=sources.filter(item=>containsGlobalCloudCall(item.filePath,item.source));
  if(!matches.length)return null;
  let entry;
  try {
    const requireProject=createRequire(join(projectRoot,'package.json'));
    const packagePath=requireProject.resolve('@dcloudio/uni-cloud/package.json');
    const manifest=JSON.parse(await readFile(packagePath,'utf8'));
    entry=typeof manifest.module==='string' ? join(dirname(packagePath),manifest.module) : requireProject.resolve('@dcloudio/uni-cloud');
  } catch{return null;}
  return {
    sourceFiles:matches.map(item=>item.filePath),
    sourceDigest:createHash('sha256').update(JSON.stringify(matches)).digest('hex'),
    sdkDigest:createHash('sha256').update(await readFile(entry)).digest('hex'),
  };
}
