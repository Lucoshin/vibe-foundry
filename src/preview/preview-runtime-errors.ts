/** Keep an already rendered surface after a failed hook/action, never after a render/setup failure. */
export function canKeepRenderedPreview(info) {
  return new Set([
    'mounted hook', 'native event handler', 'component event handler', 'v-on handler',
    'onLoad', 'onShow', 'onReady',
    ...['m', '5', '6', 'onLoad', 'onShow', 'onReady'].map(code => `https://vuejs.org/error-reference/#runtime-${code}`),
  ]).has(info);
}
