import assert from 'node:assert/strict';
import { test } from 'node:test';
import postcss from 'postcss';
import { buildComponentPreviewRegistry, buildPreviewRuntimeFiles } from '../../dist/preview/component-preview-runtime.js';

for (const [filePath, vueVersion] of [['src/Fluid.jsx', undefined], ['src/Fluid.vue', '2.6.14']]) {
  test(`standalone ${filePath} lets authored percentage widths use normal block layout`, () => {
    const registry = buildComponentPreviewRegistry([{ name: 'Fluid', filePath, exportMode: 'default' }], { projectRoot: process.cwd() });
    const files = buildPreviewRuntimeFiles(registry, { vueVersion });
    const css = postcss.parse(files['src/vibe-preview.css']);
    const intrinsicWidthRules = [];
    const scaleRules = [];
    css.walkRules(rule => {
      if (!rule.selector.includes('.vibe-preview-fit-')) return;
      rule.walkDecls(declaration => {
        if (declaration.prop === 'width' && declaration.value === 'max-content') intrinsicWidthRules.push(rule.selector);
        if (declaration.prop === 'transform' && declaration.value.includes('--vibe-preview-scale')) scaleRules.push(rule.selector);
      });
    });
    assert.ok(intrinsicWidthRules.length > 0, 'embedded fitting still measures intrinsic content');
    assert.ok(scaleRules.length > 0, 'embedded fitting still scales wide authored content');
    for (const selector of [...intrinsicWidthRules, ...scaleRules]) {
      assert.ok(selector.startsWith('.vibe-preview-shell.embedded '), `standalone shell must not impose intrinsic width or fitting transforms: ${selector}`);
    }
  });
}
