import assert from 'node:assert/strict';
import {test} from 'node:test';
import {previewBooleanControls, previewModelListeners} from '../../dist/preview/preview-prop-controls.js';
test('preview controls use declared Boolean props and preserve supplied source values',()=>{
 const component={props:{visible:{type:Boolean,default:false},checked:Boolean,title:String,disabled:{type:[Boolean,String]},computed:{type:Boolean,default:()=>true}}};
 const props={visible:true,title:'真实标题'};
 assert.deepEqual(previewBooleanControls(component,props),[{name:'visible',value:true},{name:'checked',value:false}]);
 assert.deepEqual(props,{visible:true,title:'真实标题'});
 assert.deepEqual(previewBooleanControls({props:['visible']},{}),[]);
});

test('Vue 3 model listeners update only declared source props and declared update events',()=>{
 const props={modelValue:'first',visible:true,unknown:'unchanged'};
 const component={props:{modelValue:String,visible:Boolean,missing:String},emits:['update:modelValue','update:visible','update:missing','update:unknown','submit']};
 const listeners=previewModelListeners(component,props,3,(name,value)=>{props[name]=value;});
 assert.deepEqual(Object.keys(listeners),['update:modelValue','update:visible']);
 listeners['update:modelValue']('second');listeners['update:visible'](false);
 assert.deepEqual(props,{modelValue:'second',visible:false,unknown:'unchanged'});
 assert.deepEqual(previewModelListeners({props:{visible:Boolean}},props,3,()=>{}),{});
});

test('Vue 2 model uses its explicit contract or the official value/input default',()=>{
 const props={checked:false,value:'a',modelValue:'b'};
 const write=(name,value)=>{props[name]=value;};
 const custom=previewModelListeners({props:{checked:Boolean},model:{prop:'checked',event:'change'}},props,2,write);
 custom.change(true);assert.equal(props.checked,true);assert.deepEqual(Object.keys(custom),['change']);
 const declared=previewModelListeners({props:{value:String},emits:{input:null}},props,2,write);
 declared.input('changed');assert.equal(props.value,'changed');
 const standard=previewModelListeners({props:{value:String}},props,2,write);
 standard.input('default-contract');assert.equal(props.value,'default-contract');
 assert.deepEqual(previewModelListeners({props:{value:String},emits:['input']},props,3,write),{});
});
