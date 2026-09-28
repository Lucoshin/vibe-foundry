import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createSafeProcessEnvironment } from '../utils/process-environment.js';

const exec = promisify(execFile);

export async function discoverUniPageContext(projectRoot, readSource) {
  if (!await readSource('src/pages.json')) return null;
  const requireProject = createRequire(join(projectRoot, 'package.json'));
  let normalizer;
  try { normalizer = requireProject.resolve('@dcloudio/uni-cli-shared'); }
  catch { return { error: '源项目未安装 uni-cli-shared，无法标准化页面配置。' }; }
  const code = `const {parsePagesJson,parseManifestJson}=require(process.argv[1]);
const result=parsePagesJson(process.env.UNI_INPUT_DIR,'h5');
const manifest=parseManifestJson(process.env.UNI_INPUT_DIR);
const nvue={'flex-direction':manifest.app?.nvue?.['flex-direction'] || 'column'};
process.stdout.write('VIBEHUB_PAGE_CONTEXT='+JSON.stringify({pages:result.pages.map(page=>({path:page.path,style:page.style})),globalStyle:result.globalStyle,nvue}));`;
  try {
    const { stdout } = await exec(process.execPath, ['-e', code, normalizer], {
      cwd: projectRoot,
      env: { ...createSafeProcessEnvironment(), UNI_PLATFORM: 'h5', UNI_INPUT_DIR: join(projectRoot, 'src') },
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const prefix = 'VIBEHUB_PAGE_CONTEXT=';
    const position = stdout.lastIndexOf(prefix);
    if (position < 0) return { error: '官方页面配置标准化未返回结果。' };
    const value = JSON.parse(stdout.slice(position + prefix.length));
    if (!Array.isArray(value.pages) || !value.pages.every(page => typeof page.path === 'string' && page.style && typeof page.style === 'object')) {
      return { error: '官方页面配置标准化返回了无效页面契约。' };
    }
    const sourceEvidence = await Promise.all(['src/pages.json', 'src/manifest.json'].map(async (filePath) => ({
      filePath, digest: createHash('sha256').update(await readSource(filePath)).digest('hex'),
    })));
    return { ...value, sourceEvidence };
  } catch {
    return { error: '源项目官方页面配置标准化失败，页面宿主不可用。' };
  }
}
