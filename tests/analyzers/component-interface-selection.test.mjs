import assert from 'node:assert/strict';
import test from 'node:test';
import {hasDeclaredComponentInterface} from '../../dist/analyzers/component-selection.js';

test('uncalled Vue business blocks retain declared props, events and slots',()=>{
  for(const source of [
    '<script setup lang="ts">const props=defineProps<{query:string}>()</script><template><input :value="props.query"/></template>',
    '<script setup>import {defineProps} from "vue";defineProps(["query"])</script><template><input/></template>',
    '<script setup>const emit=defineEmits(["filter"])</script><template><button @click="emit(\'filter\')">筛选</button></template>',
    '<script>export default {props:["query"],emits:["filter"]}</script><template><input/></template>',
    '<script>import {defineComponent as component} from "vue";export default component({props:{query:String}})</script><template><input/></template>',
    '<template><section><slot name="actions"/></section></template>',
  ])assert.equal(hasDeclaredComponentInterface('views/Filter.vue',source),true,source);
});

test('whole views without an interface and declaration strings do not count',()=>{
  for(const source of [
    '<template><main>完整页面</main></template><script setup>const title="首页"</script>',
    '<script setup>const text="defineProps({foo:String})";/* defineEmits(["change"]) */const example={props:["fake"]}</script><template><main>{{text}}</main></template>',
    '<script setup>function defineProps(){return {}};const example=defineProps()</script><template><main/></template>',
    '<script>export default {data(){return {props:["fake"]}}}</script><template><main/></template>',
  ])assert.equal(hasDeclaredComponentInterface('views/Home.vue',source),false,source);
});

test('unknown Vue contracts are retained without executing source',()=>{
  for(const source of [
    '<template src="./view.html"/>',
    '<template lang="pug">main</template>',
    '<script>export default unknownOptions</script>',
    '<script setup>const = invalid</script><template><main/></template>',
  ])assert.equal(hasDeclaredComponentInterface('views/Unknown.vue',source),true,source);
});
