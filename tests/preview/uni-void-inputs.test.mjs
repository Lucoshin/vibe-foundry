import assert from 'node:assert/strict';
import {test} from 'node:test';
import {closeUniVoidInputs} from '../../dist/preview/uni-void-inputs.js';
test('uni input normalization preserves quoted greater-than signs and script strings',()=>{
 const source='<script>const text="<input value=1>"</script><template><view><input value="a>b"><input value="closed" /></view></template>';
 assert.equal(closeUniVoidInputs(source),'<script>const text="<input value=1>"</script><template><view><input value="a>b" /><input value="closed" /></view></template>');
});
