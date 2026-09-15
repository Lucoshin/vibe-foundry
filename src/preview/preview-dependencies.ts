import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function installedVueVersion(projectRoot) {
  const fromProject = createRequire(join(resolve(projectRoot), 'package.json'));
  try { return JSON.parse(readFileSync(fromProject.resolve('vue/package.json'), 'utf8')).version; }
  catch (error) { if (error.code === 'MODULE_NOT_FOUND') return null; throw error; }
}

export function previewRuntimeIssue(projectRoot, runtime) {
  if (runtime !== 'vite-vue') return null;
  const version = installedVueVersion(projectRoot);
  if (version === null) return null;
  if (/^3\./.test(version) || /^2\.7\./.test(version)) return null;
  if (!/^2\.6\./.test(version)) return { code: 'PREVIEW_RUNTIME_UNSUPPORTED', message: previewFailureMessage('PREVIEW_RUNTIME_UNSUPPORTED') };
  const fromProject = createRequire(join(resolve(projectRoot), 'package.json'));
  let compilerVersion;
  try { compilerVersion = JSON.parse(readFileSync(fromProject.resolve('vue-template-compiler/package.json'), 'utf8')).version; }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return { code: 'PREVIEW_COMPILER_MISSING', message: 'Vue 2.6 预览需要源项目安装与 Vue 完全同版本的 vue-template-compiler（当前 Vue '+version+'）。' };
  }
  if (compilerVersion !== version) return { code: 'PREVIEW_COMPILER_MISMATCH', message: 'Vue 与 vue-template-compiler 版本不一致（'+version+' / '+compilerVersion+'），请在源项目对齐版本后重新炼化。' };
  return null;
}

export function assertPreviewDependencies(projectRoot, runtime) {
  const issue = previewRuntimeIssue(projectRoot, runtime);
  if (issue) throw Object.assign(new Error(issue.message), {code:issue.code});
  const requireFromProject = createRequire(join(resolve(projectRoot), 'package.json'));
  const required = runtime === 'vite-vue' ? ['vue'] : ['react/jsx-runtime', 'react-dom/client'];
  const missing = required.filter(name => {
    try { requireFromProject.resolve(name); return false; }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return true; throw error; }
  });
  if (missing.length) throw Object.assign(new Error('缺少组件运行依赖：'+missing.join('、')+'。请在源项目安装匹配版本的依赖，再重新导入炼化。'), {code:'PREVIEW_DEPENDENCIES_MISSING'});
}

export function previewFailureMessage(code) {
  if (code === 'PREVIEW_RUNTIME_UNSUPPORTED') return '当前 Vue 版本不在预览支持范围内；支持 Vue 2.6、2.7 和 Vue 3。';
  if (code === 'PREVIEW_DEPENDENCIES_MISSING') return '缺少组件运行依赖。请在源项目安装匹配版本的依赖，再重新导入炼化。';
  if (code === 'PREVIEW_COMPILER_MISSING' || code === 'PREVIEW_COMPILER_MISMATCH') return 'Vue 模板编译器缺失或版本不匹配，请在源项目安装与 Vue 完全同版本的 vue-template-compiler。';
  return '组件预览生成失败。请检查源码与运行依赖，修复后重新导入炼化。';
}
