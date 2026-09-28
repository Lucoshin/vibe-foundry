/** Browser-only evidence: layout containers alone do not prove visible component output. */
export function hasVisiblePreviewContent(canvas) {
  const view = canvas.ownerDocument.defaultView;
  const transparent = color => color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color);
  for (const element of canvas.querySelectorAll('*')) {
    if (element.hasAttribute?.('data-vibe-preview-stage') || element.closest?.('[data-vibe-preview-notice]')) continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    let visible = true;
    for (let ancestor = element; ancestor && ancestor !== canvas; ancestor = ancestor.parentElement) {
      const style = view.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) { visible = false; break; }
    }
    if (!visible) continue;
    if ([...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) return true;
    if (['IMG','SVG','CANVAS','VIDEO','INPUT','BUTTON','SELECT','TEXTAREA'].includes(element.tagName.toUpperCase())) return true;
    const style = view.getComputedStyle(element);
    if (!transparent(style.backgroundColor) || style.backgroundImage !== 'none'
      || ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].some(key => parseFloat(style[key]) > 0)) return true;
  }
  return false;
}
