import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzeComponents} from '../../dist/analyzers/component-analyzer.js';
import {isEmptyComponentShell,isIconPrimitive} from '../../dist/analyzers/component-selection.js';
const componentRules={iconPrimitives:'exclude',emptyShells:'exclude'};

test('default component distillation excludes pure icon primitives but retains complete visual and interactive components',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-component-selection-'));
 const files={
  'ArrowIcon.tsx':'export default function ArrowIcon(){ return <svg><path d="M0 0L1 1" /></svg> }',
  'SvgIcon.vue':'<template><div v-if="external" class="svg-icon"/><svg v-else v-on="$listeners"><use :href="name"/></svg></template>',
  'Iconify.vue':'<template><text class="iconify" :class="icon" :style="style" /></template>',
  'ImIcon.tsx':"import {Image} from '@tarojs/components'; export default function ImIcon(){return <Image src='icon.png'/>}",
  'IconButton.tsx':'export default function IconButton(){return <button onClick={save}><svg><path/></svg></button>}',
  'ClickableIcon.vue':'<template><svg @click="save"><path/></svg></template>',
  'IconSelect.vue':'<template><section><input v-model="query"/><SvgIcon v-for="name in names" :name="name" @click="select(name)"/></section></template>',
  'IconChart.tsx':'export default function IconChart(){return <svg><text>收入趋势</text><path/></svg>}',
  'IconCard.vue':'<template><div><slot/><svg><path/></svg></div></template>',
  'Card.tsx':'export default function Card(){return <article>Read only card</article>}',
  'IconService.tsx':'export default function IconService(){return <CustomVisualization/>}',
 };
 await mkdir(join(root,'src/components'),{recursive:true});
 for(const [name,content] of Object.entries(files))await writeFile(join(root,'src/components',name),content);
 const components=await analyzeComponents(root,['src/components'],['src'],{componentRules});
 assert.deepEqual(components.map(c=>c.name).sort(),['Card','ClickableIcon','IconButton','IconCard','IconChart','IconSelect','IconService'].sort());
 assert.equal(await readFile(join(root,'src/components/ArrowIcon.tsx'),'utf8'),files['ArrowIcon.tsx']);
});

test('excluded icon remains a dependency of its parent component',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-icon-dependency-'));
 await mkdir(join(root,'src/components'),{recursive:true});
 const icon=join(root,'src/components/ArrowIcon.tsx');
 await writeFile(icon,'export default function ArrowIcon(){return <svg><path d="M0 0"/></svg>}');
 await writeFile(join(root,'src/components/Toolbar.tsx'),"import ArrowIcon from './ArrowIcon'; export default function Toolbar(){return <button><ArrowIcon/></button>}");
 const before=await analyzeComponents(root,['src/components'],['src'],{componentRules});
 assert.deepEqual(before.map(c=>c.name),['Toolbar']);
 await writeFile(icon,'export default function ArrowIcon(){return <svg><path d="M1 1"/></svg>}');
 const after=await analyzeComponents(root,['src/components'],['src'],{componentRules});
 assert.notEqual(before[0].dependencyFingerprint,after[0].dependencyFingerprint);
});

test('does not turn identical empty slot shells into multiple reusable components',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-empty-components-'));
 await mkdir(join(root,'src/components'),{recursive:true});
 const files={
  'AiActionCard.vue':'<template><slot /></template>',
  'AiChatShell.vue':'<template><!-- placeholder --><slot /></template>',
  'Empty.vue':'<template> </template>',
  'Layout.vue':'<template><section><slot /></section></template>',
  'NamedSlot.vue':'<template><slot name="header" /></template>',
  'StyledSlot.vue':'<template><slot /></template><style>.panel {color:red}</style>',
  'Provider.vue':'<template><slot /></template><script setup>provide("theme", "dark")</script>',
 };
 for(const [name,content] of Object.entries(files))await writeFile(join(root,'src/components',name),content);
 const components=await analyzeComponents(root,['src/components'],['src'],{componentRules});
 assert.deepEqual(components.map(c=>c.name).sort(),['Layout','NamedSlot','Provider','StyledSlot']);
});

test('candidate discovery does not impose an exclusion preference without a recipe rule',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vibehub-selection-rules-'));
 await mkdir(join(root,'src/components'),{recursive:true});
 await writeFile(join(root,'src/components/ArrowIcon.tsx'),'export default function ArrowIcon(){return <svg><path/></svg>}');
 await writeFile(join(root,'src/components/Shell.vue'),'<template><slot/></template>');
 for(const options of [{},{componentRules:{iconPrimitives:'include',emptyShells:'include'}}]){
  assert.deepEqual((await analyzeComponents(root,['src/components'],['src'],options)).map(c=>c.name),['ArrowIcon','Shell']);
 }
});

test('custom component identity and unknown behavior never prove a pure icon',()=>{
 for(const [file,source] of [
  ['CustomIcon.tsx',"import Image from './InteractiveImage'; export default ()=> <Image/>"],
  ['CustomIcon.vue','<script setup>import Image from "./InteractiveImage.vue"</script><template><Image/></template>'],
  ['HelpIcon.vue','<template><svg v-tooltip="help"><path/></svg></template>'],
  ['DynamicIcon.vue','<template><svg v-bind:[attributeName]="value"><path/></svg></template>'],
  ['RatingIcon.vue','<template><div><svg v-for="item in ratings"><path :d="item.path"/></svg></div></template>'],
  ['ClickIcon.tsx','export default ()=> <svg {...{onClick:toggle}}><path/></svg>'],
 ])assert.equal(isIconPrimitive(file,file.split('.')[0],source),false,file);
 assert.equal(isIconPrimitive('ArrowIcon.tsx','ArrowIcon',"import {Image as NativeImage} from '@tarojs/components'; export default ()=> <NativeImage src='arrow.png'/>"),true);
});

test('an external Vue template is unknown material rather than an empty component shell',()=>{
 const source='<template src="./interactive-panel.html"></template>';
 assert.equal(isEmptyComponentShell('ExternalPanel.vue',source),false);
 assert.equal(isIconPrimitive('ExternalIcon.vue','ExternalIcon',source),false);
});

test('an external Vue script prevents proving that a drawing wrapper has no behavior',()=>{
 const source='<template><svg><path/></svg></template><script src="./interactive-icon.js"></script>';
 assert.equal(isIconPrimitive('InteractiveIcon.vue','InteractiveIcon',source),false);
 assert.equal(isEmptyComponentShell('ExternalShell.vue','<template><slot/></template><script src="./provider.js"></script>'),false);
});

for(const [name,file,source] of [
 ['Vue lifecycle element ref','InteractiveIcon.vue','<template><svg ref="control"><path/></svg></template><script setup>import {onMounted,ref} from "vue";const control=ref(null);onMounted(()=>control.value.addEventListener("click",select));</script>'],
 ['Vue bound callback ref','InteractiveIcon.vue','<template><svg :ref="bindControl"><path/></svg></template>'],
 ['React effect element ref','InteractiveIcon.tsx','import {useEffect,useRef} from "react";export default function InteractiveIcon(){const control=useRef(null);useEffect(()=>{control.current.addEventListener("click",select)},[]);return <svg ref={control}><path/></svg>}'],
])test(`${name} preserves a candidate whose mounted behavior is unknown`,()=>{
 assert.equal(isIconPrimitive(file,'InteractiveIcon',source),false);
});

for(const [name,file,source] of [
 ['Vue mounted event registration without ref','InteractiveIcon.vue','<template><svg id="control"><path/></svg></template><script>export default {mounted(){document.querySelector("#control").addEventListener("click",this.select)},methods:{select(){this.$emit("select")}}}</script>'],
 ['React effect event registration without ref','InteractiveIcon.tsx','import {useEffect} from "react";export default function InteractiveIcon(){useEffect(()=>{document.querySelector("#control").addEventListener("click",select)},[]);return <svg id="control"><path/></svg>}'],
])test(`${name} is explicit behavior rather than a drawing primitive`,()=>{
 assert.equal(isIconPrimitive(file,'InteractiveIcon',source),false);
});
