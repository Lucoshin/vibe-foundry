import {parse} from '@babel/parser';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';

const sha=value=>createHash('sha256').update(value).digest('hex');
const member=(node,name)=>node?.type==='MemberExpression'&&!node.computed&&node.property.name===name;

export function discoverVue3SourceGlobals(sourceIndex,vueVersion) {
  if(!vueVersion?.startsWith('3.'))return null;
  const main=sourceIndex.files.find(file=>file.filePath==='src/main.ts');
  if(!main)return null;
  const tree=parse(main.sourceText,{sourceType:'module',plugins:['typescript']});
  const imports=tree.program.body.filter(node=>node.type==='ImportDeclaration'&&node.importKind!=='type');
  const imported=new Map(imports.flatMap(node=>node.specifiers.filter(item=>item.importKind!=='type').map(item=>[item.local.name,node])));
  const creator=imports.find(node=>node.source.value==='vue')?.specifiers.find(item=>item.type==='ImportSpecifier'&&item.imported.name==='createSSRApp')?.local.name;
  const factory=tree.program.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.type==='FunctionDeclaration'&&node.declaration.id.name==='createApp')?.declaration;
  if(!creator||!factory||factory.params.length)return null;
  const body=factory.body.body;
  const declarations=body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations);
  const app=declarations.find(node=>node.id.type==='Identifier'&&node.init?.type==='CallExpression'&&node.init.callee.name===creator&&node.init.arguments.length===1&&node.init.arguments[0].type==='Identifier'&&imported.has(node.init.arguments[0].name))?.id.name;
  if(!app)return null;
  const shadowed=new Set(declarations.filter(node=>node.id.type==='Identifier').map(node=>node.id.name));
  const selected=[];
  const required=new Set();
  const localStatements=new Map();
  for(const statement of body) {
    const expression=statement.type==='ExpressionStatement'?statement.expression:null;
    if(expression?.type!=='AssignmentExpression'||expression.operator!=='='||expression.left.type!=='MemberExpression'||expression.left.computed)continue;
    const target=expression.left.object;
    if(!member(target,'globalProperties')||!member(target.object,'config')||target.object.object.name!==app)continue;
    const value=expression.right;
    if(value.type==='Identifier'&&imported.has(value.name)&&!shadowed.has(value.name)) {
      required.add(value.name);
      selected.push({name:expression.left.property.name,value:value.name});
      continue;
    }
    // Preserve only the authored synchronous system-info read and its literal fallback.
    const read=value.type==='LogicalExpression'&&value.operator==='||'&&['NumericLiteral','StringLiteral','BooleanLiteral'].includes(value.right.type)?value.left:value;
    if(read.type!=='MemberExpression'||read.computed||read.object.type!=='Identifier')continue;
    const local=declarations.find(node=>node.id.name===read.object.name);
    if(local?.init?.type!=='CallExpression'||!member(local.init.callee,'getSystemInfoSync')||local.init.callee.object.name!=='uni'||local.init.arguments.length||shadowed.has('uni')||imported.has('uni'))continue;
    localStatements.set(local.id.name,'const '+main.sourceText.slice(local.start,local.end)+';');
    selected.push({name:expression.left.property.name,value:main.sourceText.slice(value.start,value.end)});
  }
  if(!selected.length)return null;
  const usedImports=imports.filter(node=>node.specifiers.some(item=>required.has(item.local.name)));
  const registrationImports=usedImports.map(node=>({declaration:main.sourceText.slice(node.start,node.source.start),source:node.source.value.startsWith('.')?posix.join('src',node.source.value):node.source.value}));
  const files=new Map(sourceIndex.files.map(file=>[file.filePath,file]));
  const evidence=[{filePath:main.filePath,sha256:sha(main.sourceText)}];
  const seen=new Set([main.filePath]);
  const pending=usedImports.flatMap(node=>(main.dependencies??[]).filter(dep=>dep.source===node.source.value).map(dep=>dep.resolvedFilePath).filter(Boolean));
  while(pending.length){const path=pending.pop();if(seen.has(path))continue;seen.add(path);const file=files.get(path);if(!file)continue;evidence.push({filePath:path,sha256:sha(file.sourceText)});for(const dep of file.dependencies??[])if(dep.resolvedFilePath)pending.push(dep.resolvedFilePath);}
  evidence.sort((a,b)=>a.filePath.localeCompare(b.filePath));
  const result={imports:registrationImports,locals:[...localStatements.values()],assignments:selected,evidence};
  return {...result,fingerprint:sha(JSON.stringify(result))};
}

export function renderVue3SourceGlobals(registration,importPathFor) {
  return registration.imports.map(item=>item.declaration+JSON.stringify(item.source.startsWith('src/')?importPathFor(item.source):item.source)+';').join('\n')
    +'\nexport function installSourceGlobals(app) {\n'+registration.locals.join('\n')+'\n'
    +registration.assignments.map(item=>'app.config.globalProperties['+JSON.stringify(item.name)+'] = '+item.value+';').join('\n')+'\n}\n';
}
