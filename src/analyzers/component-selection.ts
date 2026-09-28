import {parse as parseJavaScript} from '@babel/parser';
import {NodeTypes,parse as parseVueTemplate} from '@vue/compiler-dom';
import {parse as parseVueSfc} from '@vue/compiler-sfc';

const graphicTags=new Set(['svg','g','path','circle','ellipse','rect','line','polyline','polygon','use','defs','symbol','title','desc','clippath','mask','lineargradient','radialgradient','stop']);
const imageTags=new Set(['img','image']);
const wrapperTags=new Set(['div','span','i','view','text','template']);
const actionRoles=new Set(['button','link','checkbox','radio','switch','tab','slider','textbox','combobox']);

/** Selection guard only: an interface or unknown source is retained, not verified. */
export function hasDeclaredComponentInterface(filePath,sourceText) {
  if(!filePath.endsWith('.vue'))return true;
  try {
    const {descriptor,errors}=parseVueSfc(sourceText,{filename:filePath});
    if(errors.length||descriptor.customBlocks.length||descriptor.template?.src
      ||(descriptor.template?.lang&&descriptor.template.lang!=='html'))return true;
    function hasSlot(node) {
      return node.type===NodeTypes.ELEMENT&&node.tag==='slot'||node.children?.some(hasSlot);
    }
    if(descriptor.template&&hasSlot(parseVueTemplate(descriptor.template.content)))return true;
    for(const script of [descriptor.script,descriptor.scriptSetup].filter(Boolean)) {
      if(script.src||(script.lang&&!['js','ts','jsx','tsx'].includes(script.lang)))return true;
      const ast=parseJavaScript(script.content,{sourceType:'module',plugins:['jsx',...(['ts','tsx'].includes(script.lang)?['typescript']:[])]});
      const body=ast.program.body;
      const shadowed=new Set(body.flatMap(node=>node.type==='ImportDeclaration'?node.specifiers
        .filter(item=>!(node.source.value==='vue'&&item.type==='ImportSpecifier'&&item.imported.name===item.local.name
          &&['defineProps','defineEmits','defineSlots','defineModel'].includes(item.imported.name))).map(item=>item.local.name)
        :node.type==='VariableDeclaration'?node.declarations.filter(item=>item.id.type==='Identifier').map(item=>item.id.name)
          :node.type==='FunctionDeclaration'?[node.id?.name]:[]));
      function hasMacro(node) {
        if(!node||typeof node!=='object'||['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(node.type))return false;
        if(node.type==='CallExpression'&&node.callee.type==='Identifier'
          &&['defineProps','defineEmits','defineSlots','defineModel'].includes(node.callee.name)&&!shadowed.has(node.callee.name))return true;
        return Object.entries(node).some(([key,value])=>!['loc','comments','extra'].includes(key)
          &&(Array.isArray(value)?value.some(hasMacro):hasMacro(value)));
      }
      if(script===descriptor.scriptSetup&&body.some(node=>['VariableDeclaration','ExpressionStatement'].includes(node.type)&&hasMacro(node)))return true;
      for(const statement of body) {
        if(statement.type==='ExportAllDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source))return true;
        if(statement.type!=='ExportDefaultDeclaration')continue;
        let options=statement.declaration;
        if(options.type==='CallExpression') {
          const officialDefine=body.some(node=>node.type==='ImportDeclaration'&&node.source.value==='vue'
            &&node.specifiers.some(item=>item.type==='ImportSpecifier'&&item.imported.name==='defineComponent'&&item.local.name===options.callee?.name));
          if(!officialDefine||options.arguments.length!==1)return true;
          options=options.arguments[0];
        }
        if(options.type!=='ObjectExpression')return true;
        if(options.properties.some(property=>property.type==='SpreadElement'||property.computed
          ||['props','emits','mixins','extends'].includes(property.key?.name??property.key?.value)))return true;
      }
    }
    return false;
  } catch { return true; }
}

function hasEventRegistration(node) {
  if(!node||typeof node!=='object')return false;
  if(node.type==='CallExpression'||node.type==='OptionalCallExpression') {
    const callee=node.callee;
    if(callee.type==='Identifier'&&callee.name==='addEventListener')return true;
    if(['MemberExpression','OptionalMemberExpression'].includes(callee.type)
      &&(callee.computed?callee.property.value:callee.property.name)==='addEventListener')return true;
  }
  return Object.entries(node).some(([key,value])=>!['loc','comments','extra'].includes(key)
    &&(Array.isArray(value)?value.some(hasEventRegistration):hasEventRegistration(value)));
}

export function isEmptyComponentShell(filePath,sourceText) {
  if(!filePath.endsWith('.vue'))return false;
  const {descriptor,errors}=parseVueSfc(sourceText,{filename:filePath});
  if(errors.length||!descriptor.template||descriptor.template.lang||descriptor.template.src
    ||descriptor.script||descriptor.scriptSetup||descriptor.styles.length||descriptor.customBlocks.length)return false;
  try {
    const root=parseVueTemplate(descriptor.template.content);
    const nodes=root.children.filter(node=>node.type!==NodeTypes.COMMENT&&(node.type!==NodeTypes.TEXT||node.content.trim()));
    return nodes.length===0||(nodes.length===1&&nodes[0].type===NodeTypes.ELEMENT
      &&nodes[0].tag==='slot'&&nodes[0].props.length===0&&nodes[0].children.length===0);
  } catch { return false; }
}

function hasScriptRendering(node) {
  if(!node||typeof node!=='object')return false;
  if(['JSXElement','JSXFragment'].includes(node.type))return true;
  if(node.type==='ImportDeclaration'&&node.source.value==='vue'
    &&node.specifiers.some(item=>item.type==='ImportSpecifier'
      &&['h','createVNode','createElementVNode','createElementBlock'].includes(item.imported.name)))return true;
  if(['ObjectProperty','ObjectMethod'].includes(node.type)
    &&['render','template','mixins','extends'].includes(node.key?.name??node.key?.value))return true;
  // A setup return may itself be a render function. Unknown returned bindings
  // cannot establish that a script-only component has no visual surface.
  if(node.type==='ReturnStatement'&&node.argument
    &&!['ObjectExpression','NullLiteral','BooleanLiteral','NumericLiteral','StringLiteral'].includes(node.argument.type))return true;
  if(node.type==='CallExpression'||node.type==='OptionalCallExpression') {
    const callee=node.callee;
    const name=callee.type==='Identifier'?callee.name:callee.property?.name??callee.property?.value;
    if(['h','defineRender','createVNode','createElementVNode','createElementBlock','createApp','createSSRApp','createElement','appendChild','insertAdjacentHTML','$mount'].includes(name))return true;
  }
  if(node.type==='AssignmentExpression'&&['innerHTML','outerHTML'].includes(node.left?.property?.name??node.left?.property?.value))return true;
  return Object.entries(node).some(([key,value])=>!['loc','comments','extra'].includes(key)
    &&(Array.isArray(value)?value.some(hasScriptRendering):hasScriptRendering(value)));
}

/** A provider can carry business logic while having no visual surface of its own. */
export function isHeadlessComponent(filePath,sourceText) {
  if(!filePath.endsWith('.vue'))return false;
  try {
    const {descriptor,errors}=parseVueSfc(sourceText,{filename:filePath});
    if(errors.length||descriptor.customBlocks.length||descriptor.template?.src
      ||(descriptor.template?.lang&&descriptor.template.lang!=='html'))return false;
    for(const script of [descriptor.script,descriptor.scriptSetup].filter(Boolean)) {
      if(script.src||(script.lang&&!['js','ts','jsx','tsx'].includes(script.lang)))return false;
      const ast=parseJavaScript(script.content,{sourceType:'module',plugins:['jsx',...(['ts','tsx'].includes(script.lang)?['typescript']:[])]});
      if(hasScriptRendering(ast.program))return false;
      for(const statement of ast.program.body) {
        if(statement.type==='ExportAllDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source))return false;
        if(statement.type==='ExportDefaultDeclaration'&&statement.declaration.type!=='ObjectExpression') {
          const declaration=statement.declaration;
          const officialDefine=ast.program.body.some(node=>node.type==='ImportDeclaration'&&node.source.value==='vue'
            &&node.specifiers.some(item=>item.type==='ImportSpecifier'&&item.imported.name==='defineComponent'&&item.local.name===declaration.callee?.name));
          if(declaration.type!=='CallExpression'||!officialDefine||declaration.arguments.length!==1||declaration.arguments[0].type!=='ObjectExpression')return false;
        }
        if(statement.type==='ExportDefaultDeclaration') {
          const options=statement.declaration.type==='ObjectExpression'?statement.declaration:statement.declaration.arguments[0];
          if(options.properties.some(property=>property.type==='SpreadElement'||property.computed))return false;
        }
      }
    }
    if(!descriptor.template)return true;
    const root=parseVueTemplate(descriptor.template.content);
    function empty(node) {
      if(node.type===NodeTypes.COMMENT)return true;
      if(node.type===NodeTypes.TEXT)return !node.content.trim();
      if(node.type!==NodeTypes.ELEMENT)return false;
      const transparentWrapper=['div','view','span'].includes(node.tag)&&node.props.length===0
        &&descriptor.styles.every(style=>!style.src&&!style.content.trim());
      return (['slot','template'].includes(node.tag)||transparentWrapper)&&node.children.every(empty);
    }
    return root.children.every(empty);
  } catch { return false; }
}

/** Only exclude positively identified drawing wrappers; uncertain or composed UI remains a candidate. */
export function isIconPrimitive(filePath,componentName,sourceText) {
  let graphical=false;
  const namedIcon=/icon/i.test(componentName)||/(?:^|\/)icons?\//i.test(filePath);
  function tagAllowed(tag,attributes) {
    if(!graphicTags.has(tag)&&!imageTags.has(tag)&&!wrapperTags.has(tag))return false;
    // A bitmap alone may be a photo or poster. Its shape provides no icon evidence.
    if(imageTags.has(tag)&&!namedIcon)return false;
    if(tag==='svg'||imageTags.has(tag))graphical=true;
    for(const [name,value] of attributes) {
      // An element reference can attach behavior outside the rendering structure.
      if(name==='ref')return false;
      if(name==='role'&&actionRoles.has(value))return false;
      if(name==='tabindex'||name==='tabIndex'||name==='contenteditable'||name==='contentEditable')return false;
      if(name==='class'&&typeof value==='string'&&/icon/i.test(value))graphical=true;
    }
    return true;
  }
  try {
    if(filePath.endsWith('.vue')) {
      const {descriptor,errors}=parseVueSfc(sourceText,{filename:filePath});
      if(errors.length||!descriptor.template||descriptor.template.lang||descriptor.template.src||descriptor.script?.src)return false;
      for(const script of [descriptor.script,descriptor.scriptSetup].filter(Boolean)) {
        const ast=parseJavaScript(script.content,{sourceType:'module',plugins:['jsx',...(script.lang==='ts'?['typescript']:[])]});
        if(hasEventRegistration(ast.program))return false;
      }
      const root=parseVueTemplate(descriptor.template.content,{isVoidTag:tag=>['img','image'].includes(tag)});
      function visit(node,label=false) {
        if(node.type===NodeTypes.COMMENT)return true;
        if(node.type===NodeTypes.TEXT)return label||!node.content.trim();
        if(node.type===NodeTypes.INTERPOLATION)return label;
        if(node.type!==NodeTypes.ELEMENT)return false;
        if(/^[A-Z]/.test(node.tag))return false;
        const tag=node.tag.toLowerCase();
        const attributes=[];
        for(const prop of node.props) {
          if(prop.type===NodeTypes.ATTRIBUTE)attributes.push([prop.name,prop.value?.content]);
          else if(prop.type===NodeTypes.DIRECTIVE) {
            if(!['bind','on','if','else','else-if','show','once','memo'].includes(prop.name))return false;
            // Event forwarding alone adds no interaction of its own. Explicit handlers do.
            if(prop.name==='on'&&(prop.arg||prop.exp?.content!=='$listeners'))return false;
            if(['model','slot'].includes(prop.name))return false;
            if(prop.name==='bind'&&prop.arg&&['role','tabindex','contenteditable','ref'].includes(prop.arg.content))return false;
            if(prop.name==='bind'&&(!prop.arg||!prop.arg.isStatic))return false;
          }
        }
        return tagAllowed(tag,attributes)&&node.children.every(child=>visit(child,['title','desc'].includes(tag)));
      }
      return root.children.length>0&&root.children.every(node=>visit(node))&&graphical;
    }
    const ast=parseJavaScript(sourceText,{sourceType:'module',plugins:['jsx',...(filePath.endsWith('.tsx')?['typescript']:[])]});
    if(hasEventRegistration(ast.program))return false;
    const nativeImages=new Set(ast.program.body.filter(node=>node.type==='ImportDeclaration'
      &&['@tarojs/components','react-native'].includes(node.source.value)).flatMap(node=>node.specifiers
      .filter(specifier=>specifier.type==='ImportSpecifier'&&specifier.imported.name==='Image')
      .map(specifier=>specifier.local.name)));
    const roots=[];
    function collect(node) {
      if(!node||typeof node!=='object')return;
      if(node.type==='JSXElement'||node.type==='JSXFragment'){roots.push(node);return;}
      for(const [key,value] of Object.entries(node)) {
        if(['loc','comments','extra'].includes(key))continue;
        if(Array.isArray(value))value.forEach(collect);else collect(value);
      }
    }
    function visit(node,label=false) {
      if(node.type==='JSXText')return label||!node.value.trim();
      if(node.type==='JSXExpressionContainer')return node.expression.type==='JSXEmptyExpression'||label;
      if(node.type==='JSXFragment')return node.children.every(child=>visit(child,label));
      if(node.type!=='JSXElement'||node.openingElement.name.type!=='JSXIdentifier')return false;
      const originalTag=node.openingElement.name.name;
      // Arbitrary custom components cannot be identified from their name alone.
      if(/^[A-Z]/.test(originalTag)&&!nativeImages.has(originalTag))return false;
      const tag=nativeImages.has(originalTag)?'image':originalTag.toLowerCase(),attributes=[];
      for(const attr of node.openingElement.attributes) {
        if(attr.type==='JSXSpreadAttribute')return false;
        if(attr.name.type!=='JSXIdentifier')continue;
        const name=attr.name.name;
        if(/^on[A-Z]/.test(name))return false;
        const value=attr.value?.type==='StringLiteral'?attr.value.value:undefined;
        if(['role','tabIndex','contentEditable'].includes(name)&&value===undefined)return false;
        attributes.push([name==='className'?'class':name,value]);
      }
      return tagAllowed(tag,attributes)&&node.children.every(child=>visit(child,['title','desc'].includes(tag)));
    }
    collect(ast.program);
    return roots.length>0&&roots.every(node=>visit(node))&&graphical;
  } catch {
    // A parse failure provides no evidence that a component is only a drawing.
    return false;
  }
}
