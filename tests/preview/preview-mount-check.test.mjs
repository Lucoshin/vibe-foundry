import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hasVisiblePreviewContent} from '../../dist/preview/preview-mount-check.js';
function scene({text='',tag='DIV',width=100,height=40,display='block',visibility='visible',opacity='1',backgroundColor='rgba(0, 0, 0, 0)'}={}) {
 const node={tagName:tag,childNodes:text?[{nodeType:3,textContent:text}]:[],getBoundingClientRect:()=>({width,height}),parentElement:null};
 const document={defaultView:{getComputedStyle:()=>({display,visibility,opacity,backgroundColor,backgroundImage:'none',borderTopWidth:'0px',borderRightWidth:'0px',borderBottomWidth:'0px',borderLeftWidth:'0px'})}};
 node.ownerDocument=document;
 return {ownerDocument:document,querySelectorAll:()=>[node],contains:()=>true};
}
test('empty slot wrappers and hidden content cannot validate a preview',()=>{
 assert.equal(hasVisiblePreviewContent(scene()),false);
 assert.equal(hasVisiblePreviewContent(scene({text:' ',width:320})),false);
 assert.equal(hasVisiblePreviewContent(scene({text:'hidden',display:'none'})),false);
 assert.equal(hasVisiblePreviewContent(scene({text:'hidden',opacity:'0'})),false);
 assert.equal(hasVisiblePreviewContent(scene({tag:'SVG',height:0})),false);
});
test('visible text, controls and painted graphics count as actual preview content',()=>{
 for(const options of [{text:'暂无数据'},{tag:'BUTTON'},{tag:'SVG'},{backgroundColor:'rgb(200, 0, 0)'}]) assert.equal(hasVisiblePreviewContent(scene(options)),true);
});
