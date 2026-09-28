import assert from 'node:assert/strict';
import {test} from 'node:test';
import {uniJsonConfigPlugin} from '../../src/preview/uni-json-config.ts';

test('JSONC transform delegates H5 pages preprocessing and preserves parser values',()=>{
 const calls=[];
 const tools={initPreContext(platform){calls.push(platform)},preJson(source,path){calls.push([source,path]);return 'preprocessed'},parse(source,errors){calls.push(source);return {url:'https://example.test/a//b',text:'/* literal */',pages:[]}}};
 const plugin=uniJsonConfigPlugin('/project',true,tools);
 const result=plugin.transform('{ // source comment\n }','/project/src/pages.json');
 assert.equal(plugin.enforce,'pre'); assert.equal(calls[0],'h5');assert.equal(calls[2],'preprocessed');
 assert.deepEqual(JSON.parse(result),{url:'https://example.test/a//b',text:'/* literal */',pages:[]});
 assert.equal(plugin.transform('{}','/project/src/other.json'),null);
 assert.equal(plugin.transform('{}','/outside/src/pages.json'),null);
});
test('manifest uses JSONC without pages preprocessing, invalid JSON fails and raw import stays raw',()=>{
 const tools={initPreContext(){},preJson(){throw Error('must not preprocess manifest')},parse(source,errors){if(source==='invalid')errors.push({error:1,offset:3});return {name:'actual'}}};
 const plugin=uniJsonConfigPlugin('/project',true,tools);
 assert.deepEqual(JSON.parse(plugin.transform('{/*comment*/}','/project/src/manifest.json')),{name:'actual'});
 assert.throws(()=>plugin.transform('invalid','/project/src/manifest.json'),/JSONC.*offset 3/);
 assert.equal(plugin.transform('{}','/project/src/pages.json?raw'),null);
 assert.equal(uniJsonConfigPlugin('/project',false).transform('{}','/project/src/pages.json'),null);
});
