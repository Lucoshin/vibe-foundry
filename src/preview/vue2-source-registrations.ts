import {parse} from '@babel/parser';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';

function identifiers(node, result=new Set()) {
  if(!node||typeof node!=='object')return result;
  if(node.type==='Identifier')result.add(node.name);
  for(const [key,value] of Object.entries(node)) {
    if(['loc','start','end','comments'].includes(key))continue;
    if(Array.isArray(value))value.forEach(item=>identifiers(item,result));
    else if(value&&typeof value==='object')identifiers(value,result);
  }
  return result;
}
const member=(node,object,name)=>node?.type==='MemberExpression'&&!node.computed&&node.object?.name===object&&node.property?.name===name;

export function discoverVue2SourceRegistrations(sourceIndex, vueVersion) {
  if(!vueVersion?.startsWith('2.'))return null;
  const main=sourceIndex.files.find(file=>file.filePath==='src/main.js');
  if(!main)return null;
  const tree=parse(main.sourceText,{sourceType:'module'});
  const imports=tree.program.body.filter(node=>node.type==='ImportDeclaration');
  const vue=imports.find(node=>node.source.value==='vue')?.specifiers.find(node=>node.type==='ImportDefaultSpecifier')?.local.name;
  if(!vue)return null;
  const bindings=new Map(imports.flatMap(node=>node.specifiers.map(specifier=>[specifier.local.name,node])));
  const statements=[];
  let store=null;
  for(const statement of tree.program.body) {
    const value=statement.type==='ExpressionStatement'?statement.expression:null;
    if(value?.type==='AssignmentExpression'&&value.operator==='='&&value.left.type==='MemberExpression'&&!value.left.computed
      &&member(value.left.object,vue,'prototype')&&value.right.type==='Identifier'&&bindings.has(value.right.name))statements.push(statement);
    if(value?.type==='CallExpression') {
      const args=value.arguments;
      if(member(value.callee,vue,'component')&&args.length===2&&args[0].type==='StringLiteral'&&args[1].type==='Identifier'&&bindings.has(args[1].name))statements.push(statement);
      else if(member(value.callee,vue,'use')&&args[0]?.type==='Identifier'&&bindings.has(args[0].name)) {
        const references = new Set();
        function referenced(node) {
          if(!node||typeof node!=='object')return;
          if(node.type==='Identifier'){references.add(node.name);return;}
          for(const [key,child] of Object.entries(node)) {
            if(['loc','start','end','comments'].includes(key))continue;
            if(!node.computed&&((node.type==='MemberExpression'&&key==='property')||(node.type==='ObjectProperty'&&key==='key')))continue;
            if(Array.isArray(child))child.forEach(referenced);else if(child&&typeof child==='object')referenced(child);
          }
        }
        args.forEach(referenced);
        if([...references].every(name=>bindings.has(name)||name==='undefined'))statements.push(statement);
      } else if(value.callee.type==='MemberExpression'&&!value.callee.computed&&value.callee.property.name==='install'
        &&bindings.has(value.callee.object.name)&&args.length===0)statements.push(statement);
    }
    const instance=value?.type==='CallExpression'&&value.callee.type==='MemberExpression'&&!value.callee.computed&&value.callee.property.name==='$mount'?value.callee.object:value;
    if(instance?.type==='NewExpression'&&instance.callee.name===vue&&instance.arguments[0]?.type==='ObjectExpression') {
      const prop=instance.arguments[0].properties.find(item=>item.type==='ObjectProperty'&&!item.computed&&(item.key.name??item.key.value)==='store');
      if(prop?.value.type==='Identifier'&&bindings.has(prop.value.name))store=prop.value.name;
    }
  }
  if(!statements.length&&!store)return null;
  const required=identifiers(statements);required.add(vue);if(store)required.add(store);
  const selected=imports.filter(node=>node.specifiers.some(item=>required.has(item.local.name)));
  const selectedImports=selected.map(node=>({declaration:main.sourceText.slice(node.start,node.source.start),source:node.source.value.startsWith('.')?posix.join('src',node.source.value):node.source.value}));
  const files=new Map(sourceIndex.files.map(file=>[file.filePath,file]));
  const pending=selected.flatMap(node=>(main.dependencies??[]).filter(dep=>dep.source===node.source.value).map(dep=>dep.resolvedFilePath).filter(Boolean));
  const evidence=[{filePath:main.filePath,sha256:createHash('sha256').update(main.sourceText).digest('hex')}];
  const seen=new Set([main.filePath]);
  while(pending.length){const path=pending.pop();if(seen.has(path))continue;seen.add(path);const file=files.get(path);if(!file)continue;evidence.push({filePath:path,sha256:createHash('sha256').update(file.sourceText).digest('hex')});for(const dep of file.dependencies??[])if(dep.resolvedFilePath)pending.push(dep.resolvedFilePath);}
  evidence.sort((a,b)=>a.filePath.localeCompare(b.filePath));
  const result={imports:selectedImports,statements:statements.map(node=>main.sourceText.slice(node.start,node.end)),store,evidence};
  return {...result,fingerprint:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}

export function renderVue2SourceRegistrations(registration, importPathFor) {
  return registration.imports.map(item=>item.declaration+JSON.stringify(item.source.startsWith('src/')?importPathFor(item.source):item.source)+';').join('\n')
    +'\nexport function installSourceRegistrations() {\n'+registration.statements.join('\n')+'\nreturn { '+(registration.store?'store: '+registration.store:'')+' };\n}\n';
}
