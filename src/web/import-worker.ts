import { distillProject } from '../index.js';
import { distillBook } from '../analyzers/book-distiller.js';

const [kind, sourcePath, assetLibraryRoot, recipeId, rawRecipeVersion] = process.argv.slice(2);
try {
  if (!['project', 'document'].includes(kind)) throw new Error('未知炼化类型。');
  if (kind === 'project' && (!recipeId || !/^\d+$/.test(rawRecipeVersion) || Number(rawRecipeVersion) < 1 || process.argv.length !== 7)) throw new Error('工程导入必须提供冻结的炼化方案版本。');
  if (kind === 'document' && process.argv.length !== 5) throw new Error('文档导入不能携带工程炼化方案。');
  const result = kind === 'project'
    ? await distillProject(sourcePath, { assetLibraryRoot, recipeId, recipeVersion: Number(rawRecipeVersion) })
    : await distillBook(sourcePath, { assetLibraryRoot });
  process.stdout.write(JSON.stringify({ outputDir: result.outputDir }));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
