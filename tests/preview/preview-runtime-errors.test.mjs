import assert from 'node:assert/strict';
import test from 'node:test';
import { canKeepRenderedPreview } from '../../dist/preview/preview-runtime-errors.js';

test('only post-render hooks and actions retain the existing preview surface', () => {
  for (const info of ['mounted hook', 'v-on handler', 'https://vuejs.org/error-reference/#runtime-m', 'https://vuejs.org/error-reference/#runtime-6']) assert.equal(canKeepRenderedPreview(info), true);
  for (const info of ['render function', 'setup function', 'https://vuejs.org/error-reference/#runtime-0', 'https://vuejs.org/error-reference/#runtime-1', undefined]) assert.equal(canKeepRenderedPreview(info), false);
});
