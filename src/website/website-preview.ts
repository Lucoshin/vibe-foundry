import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readWebsiteCapture } from './website-capture.js';

const scriptValue = value => JSON.stringify(value).replaceAll('<','\\u003c');
export async function writeWebsitePreviewBundle(projectRoot, preview, outputDir) {
  if (!/^[a-f0-9]{64}$/.test(preview.snapshotDigest)) throw new Error('Invalid website snapshot digest');
  const capture = await readWebsiteCapture(join(projectRoot,preview.snapshotDigest));
  if (capture.snapshotDigest !== preview.snapshotDigest) throw new Error('Website snapshot digest mismatch');
  const control = capture.manifest.controls.find(item=>item.id===preview.controlId);
  if (!control) throw new Error('Website control missing');
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
  for (const [path,bytes] of capture.files) {
    let content=bytes;
    if (path.endsWith('.html')) {
      let html=bytes.toString('utf8');
      if (!/<head(?:\s[^>]*)?>/i.test(html)) {
        const opening = html.match(/<html(?:\s[^>]*)?>/i) ?? html.match(/<!doctype[^>]*>/i);
        if (opening) html = html.replace(opening[0], opening[0]+'<head></head>');
        else html = '<head></head>'+html;
      }
      html=html.replace(/<head(?:\s[^>]*)?>/i,match=>match+policy);
      if (path===control.entry) {
        const monitor=`<script>let failed=false;addEventListener('error',()=>{failed=true;},true);addEventListener('unhandledrejection',()=>{failed=true;});addEventListener('load',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=document.querySelector(${scriptValue(control.selector)});const box=target?.getBoundingClientRect();parent.postMessage({type:'vibe-website-mounted',id:${scriptValue(preview.id)},ok:!failed&&!!box&&box.width>0&&box.height>0},'*');})));</script>`;
        html=html.replace(policy,policy+monitor);
      }
      content=html;
    }
    const pathOut=join(outputDir,'website',path);
    await mkdir(dirname(pathOut),{recursive:true});
    await writeFile(pathOut,content);
  }
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>网站控件预览</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f8f9f7}iframe{border:0;width:100%;height:100%}p{font:14px sans-serif;padding:24px}</style></head><body data-vibe-preview-canvas><iframe id="website" title="网站控件" sandbox="allow-scripts" src="./website/${control.entry}"></iframe><script>const frame=document.getElementById('website');addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='vibe-website-mounted'||event.data.id!==${scriptValue(preview.id)})return;if(!event.data.ok){document.body.insertAdjacentHTML('beforeend','<p>控件未能完整挂载，请检查来源资源与浏览器错误。</p>');return;}fetch('/api/component-preview-validation/'+encodeURIComponent(${scriptValue(preview.id)})+'?actionDigest='+${scriptValue(preview.actionDigest)},{method:'POST'}).catch(()=>{});});</script></body></html>`;
  await writeFile(join(outputDir,'index.html'),html);
}
