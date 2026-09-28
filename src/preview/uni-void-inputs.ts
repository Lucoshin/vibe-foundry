import {parse} from '@vue/compiler-sfc';
/** Preserve native input void semantics before uni tag renaming; offsets come from the SFC parser. */
export function closeUniVoidInputs(source) {
  const {descriptor}=parse(source);
  const positions=[];
  function visit(node){
    if(node.type===1 && node.tag==='input' && !node.isSelfClosing) positions.push(node.loc.end.offset-1);
    for(const child of node.children??[])visit(child);
  }
  if(descriptor.template?.ast)visit(descriptor.template.ast);
  for(const position of positions.sort((a,b)=>b-a))source=source.slice(0,position)+' /'+source.slice(position);
  return source;
}
