import { distillProject } from '../index.js';
import { distillBook } from '../analyzers/book-distiller.js';

const [kind, sourcePath, assetLibraryRoot] = process.argv.slice(2);
try {
  if (!['project', 'document'].includes(kind)) throw new Error('未知炼化类型。');
  const result = kind === 'project'
    ? await distillProject(sourcePath, { assetLibraryRoot })
    : await distillBook(sourcePath, { assetLibraryRoot });
  process.stdout.write(JSON.stringify({ outputDir: result.outputDir }));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
