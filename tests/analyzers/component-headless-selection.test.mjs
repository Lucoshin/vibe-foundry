import assert from 'node:assert/strict';
import test from 'node:test';
import {isHeadlessComponent,isIconPrimitive,isEmptyComponentShell} from '../../dist/analyzers/component-selection.js';

test('pure drawing evidence does not depend on an icon filename',()=>{
  for(const [file,name,source] of [
    ['PlainLogo.vue','PlainLogo','<template><svg><path d="M0 0"/></svg></template>'],
    ['Close.tsx','Close','export default ()=><svg><path d="M0 0"/></svg>'],
    ['Mark.vue','Mark','<template><span><svg><title>品牌标志</title><path/></svg></span></template>'],
  ]) assert.equal(isIconPrimitive(file,name,source),true,file);
});

test('bitmap photos and image cards are preserved without icon evidence',()=>{
  for(const [file,name,source] of [
    ['Photo.vue','Photo','<template><img src="./portrait.jpg"/></template>'],
    ['ImageCard.vue','ImageCard','<template><view><image src="./poster.png"/></view></template>'],
    ['Photo.tsx','Photo','export default ()=><img src="./portrait.jpg"/>'],
  ])assert.equal(isIconPrimitive(file,name,source),false,file);
  assert.equal(isIconPrimitive('CloseIcon.vue','CloseIcon','<template><img src="./close.png"/></template>'),true);
});

test('headless Vue providers and slot containers have no independently rendered content',()=>{
  for(const source of [
    '<script setup>import {provide} from "vue";provide("session",{signedIn:false});</script>',
    '<template><slot/></template><script setup>import {provide,ref} from "vue";provide("theme",ref("dark"));</script>',
    '<template><!-- wrapper --><template v-if="enabled"><slot name="header" :user="user"/><slot/></template></template><script>export default {props:["enabled","user"]}</script>',
    '<template>  <!-- empty --> </template>',
    '<template><div><slot/></div></template>',
    '<script setup></script><template><view><slot/></view></template><style scoped></style>',
  ]) assert.equal(isHeadlessComponent('Provider.vue',source),true,source);
  assert.equal(isEmptyComponentShell('Provider.vue','<template><slot/></template><script setup>provide("theme","dark")</script>'),false,'legacy emptyShells remains narrower');
});

test('business UI, slot fallback content and script-generated rendering are retained',()=>{
  for(const source of [
    '<template><button @click="submit"><svg><path/></svg></button></template>',
    '<template><svg @click="close"><path/></svg></template>',
    '<template><div class="panel"><slot/></div></template>',
    '<template><div><slot/></div></template><style>div{background:red}</style>',
    '<template><div @click="act"><slot/></div></template>',
    '<template><slot><p>默认业务说明</p></slot></template>',
    '<template><slot>{{ user.name }}</slot></template>',
    '<template><template v-if="open"><BusinessDialog/></template></template>',
    '<script>import {h} from "vue";export default {render(){return h("button","确定")}}</script>',
    '<script setup lang="tsx">const render = () => <button>确定</button></script>',
    '<script setup>document.body.appendChild(document.createElement("div"));</script>',
    '<script>import Panel from "./Panel.vue";export default Panel;</script>',
    '<script>import {h as make} from "vue";export default {setup(){return ()=>make("button")}}</script>',
    '<script>import options from "./options.js";export default {...options};</script>',
    '<script>const key="render";export default {[key](){return "visible"}};</script>',
    '<script>import renderPanel from "./render.js";export default {setup(){return renderPanel}};</script>',
    '<script setup>import renderPanel from "./render.js";defineRender(renderPanel);</script>',
  ]) assert.equal(isHeadlessComponent('Business.vue',source),false,source);
  for(const source of [
    '<template><svg @click="close"><path/></svg></template>',
    '<template><div><svg/><span>确认删除</span></div></template>',
    '<template><div><svg/><slot name="actions"/></div></template>',
  ])assert.equal(isIconPrimitive('Close.vue','Close',source),false,source);
});

test('external, malformed and unknown-language Vue sources cannot prove headlessness',()=>{
  for(const source of [
    '<template src="./page.html"/>',
    '<template lang="pug">slot</template>',
    '<template><slot/></template><script lang="coffee">doSomething()</script>',
    '<template><slot/></template><script src="./render.js"/>',
    '<template><slot></template>',
    '<template><slot/></template><script setup>const = invalid;</script>',
    '<script>export {default} from "./Panel.vue";</script>',
  ])assert.equal(isHeadlessComponent('Unknown.vue',source),false,source);
  assert.equal(isHeadlessComponent('Provider.tsx','export default () => null'),false);
});
