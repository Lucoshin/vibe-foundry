import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProjectPages } from '../../dist/analyzers/project-page-analyzer.js';
import { buildFrontendSourceIndex } from '../../dist/analyzers/frontend-source-index.js';

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'vibehub-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

test('registered main and subpackage pages preserve titles, actual blocks and state evidence', async (t) => {
  const root = await fixture(t, {
    'src/pages.json': `{// comment\n"pages":[{"path":"pages/publish/index","style":{"navigationBarTitleText":"发布岗位"}}],"subPackages":[{"root":"pagesB","pages":[{"path":"promotion/index"}]}]}`,
    'src/pages/publish/index.vue': `<template>\n<view v-if="mode === 'quick'">\n<job-card/><JobCard v-show="opened"/>\n<Unknown/>\n</view>\n</template>\n<script setup>import JobCard from '../../components/JobCard.vue';import Unused from '../../components/Unused.vue';</script>`,
    'src/pagesB/promotion/index.vue': '<template><view>推广</view></template>',
    'src/pages/unregistered.vue': '<template>未注册</template>',
    'src/components/JobCard.vue': '<template><view>岗位</view></template>',
    'src/components/Unused.vue': '<template><view>未用</view></template>',
  });
  const sourceIndex = await buildFrontendSourceIndex(root);
  const pages = await analyzeProjectPages(root, { sourceIndex });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].name, '发布岗位');
  assert.equal(pages[0].route, '/pages/publish/index');
  assert.equal(pages[0].kind, 'page');
  assert.deepEqual(pages[0].sourceFiles, ['src/pages/publish/index.vue', 'src/pages.json']);
  assert.equal(pages[0].blocks.length, 2);
  assert.deepEqual(pages[0].blocks.map(b => b.filePath), ['src/components/JobCard.vue', 'src/components/JobCard.vue']);
  assert.notDeepEqual(pages[0].blocks[0].sourceLocation, pages[0].blocks[1].sourceLocation);
  assert.deepEqual(pages[0].states.map(s => [s.directive, s.expression]), [['if', "mode === 'quick'"], ['show', 'opened']]);
  assert.equal(pages[0].states[0].sourceLocation.line, 2);
  assert.equal(pages[1].route, '/pagesB/promotion/index');
  assert.equal(pages[1].name, 'pagesB/promotion/index');
  assert.match(pages[0].sourceFingerprint, /^[a-f0-9]{64}$/);
  await writeFile(join(root, 'src/pages.json'), '{"pages":[{"path":"pages/publish/index","style":{"navigationBarTitleText":"修改标题"}}]}');
  const changed = await analyzeProjectPages(root, { sourceIndex });
  assert.notEqual(changed[0].sourceFingerprint, pages[0].sourceFingerprint);
});

test('absence is empty but malformed config, missing page and route traversal are errors', async (t) => {
  const root = await fixture(t, { 'src/note.txt': '' });
  assert.deepEqual(await analyzeProjectPages(root, { sourceIndex: { files: [] } }), []);
  for (const config of ['{"pages":', '{"pages":"bad"}', '{"pages":[{"path":"pages/missing"}]}', '{"pages":[{"path":"../outside"}]}', '{"pages":[{"path":"pages/missing","style":call()}]}']) {
    await writeFile(join(root, 'src/pages.json'), config);
    await assert.rejects(analyzeProjectPages(root, { sourceIndex: { files: [] } }));
  }
});

test('cross-platform registration of the same source page produces one asset', async (t) => {
  const root = await fixture(t, {
    'src/pages.json': `{"pages":[// #ifndef MP-WEIXIN\n{"path":"pagesD/home"}// #endif\n],"subPackages":[// #ifdef MP-WEIXIN\n{"root":"pagesD","pages":[{"path":"home"}]}// #endif\n]}`,
    'src/pagesD/home.vue': '<template><view>首页</view></template>',
  });
  const sourceIndex = await buildFrontendSourceIndex(root);
  const pages = await analyzeProjectPages(root, { sourceIndex });
  assert.equal(pages.length, 1);
  assert.ok(pages[0].limitations.some(item => item.includes('跨平台')));
  assert.ok(pages[0].limitations.some(item => item.includes('尚未验证')));
});

test('Vue Router declarations preserve real nested paths, titles and source locations', async (t) => {
  const root = await fixture(t, {
    'src/router/index.js': `import Router from 'vue-router';import Layout from '@/layout';
export const constantRoutes = [{path:'/login',component:()=>import('@/views/login')}, {path:'/user',component:Layout,children:[{path:'profile',component:()=>import('../views/profile/index.vue'),meta:{title:'个人中心'}}]}];
export const dynamicRoutes = [{path:'/user-auth',permissions:['edit'],children:[{path:'role/:userId(\\\\d+)',component:()=>import('@/views/role')}]}];
const unrelated=[{path:'/fake',component:()=>import('@/views/other')}];
export default new Router({routes:constantRoutes});`,
    'src/views/login.vue': '<template><form>登录</form></template>',
    'src/views/profile/index.vue': '<template><div>个人中心</div></template>',
    'src/views/role.vue': '<template><div>角色</div></template>',
    'src/views/other.vue': '<template><div>不应注册</div></template>',
  });
  const sourceIndex = await buildFrontendSourceIndex(root);
  const pages = await analyzeProjectPages(root, { sourceIndex });
  assert.deepEqual(pages.map(p => p.route), ['/login', '/user/profile', '/user-auth/role/:userId(\\d+)']);
  assert.equal(pages[1].name, '个人中心');
  assert.equal(pages[1].filePath, 'src/views/profile/index.vue');
  assert.equal(pages[1].sourceLocation.line, 2);
  assert.deepEqual(pages[1].sourceFiles, ['src/views/profile/index.vue', 'src/router/index.js']);
  assert.ok(pages[2].limitations.some(value => value.includes('权限')));
});
