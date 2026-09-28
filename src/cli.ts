#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { distillProject } from "./index.js";
import { distillWebsite } from "./website/distill-website.js";
import { distillBook } from "./analyzers/book-distiller.js";
import { importBookKnowledge, prepareBookKnowledge } from "./analyzers/book-knowledge-workflow.js";
import { startWebServer } from "./web/server.js";
import { resolveAssetLibraryRoot } from "./library/asset-library.js";
import { listRecipes, saveRecipe } from "./learning/recipes.js";
import { prepareLearning, importLearningAnalysis, listLearningTasks } from "./learning/workflow.js";
import { createTaskContext } from "./application/task-context.js";
import { inspectImage, importImageAnalysis, reviseImageAnalysis } from "./images/workflow.js";
import {prepareConversation} from './learning/conversations.js';
import {getLearningMemory} from './learning/memory.js';
import {prepareCreator,getCreatorTask,importCreatorAnalysis} from './learning/creators.js';
import {savePrompt,listPrompts,getPrompt,renderPrompt} from './prompts/workflow.js';
import {saveKnowledgeCollection,listKnowledgeCollections,getKnowledgeCollection,exploreAssetRelations} from './application/knowledge-collections.js';

const usage = [
  "Usage:",
  "  vibe distill <project-root> [--recipe <id>] [--recipe-version <version>]",
  "  vibe distill-website <capture-directory>",
  "  vibe distill-book <book-path>",
  "  vibe distill-book <book-path> --prepare <new-work-dir>",
  "  vibe distill-book <book-path> --analysis <analysis-json>",
  "  vibe web <project-root> [--port <port>]",
  "  vibe learn prepare <source-json> [recipe-id]",
  "  vibe learn import <task-id> <analysis-json>",
  "  vibe learn tasks",
  "  vibe recipes list",
  "  vibe recipes save <recipe-json>",
  "  vibe context <selection-json>",
  "  vibe image inspect <image-path>",
  "  vibe image import <image-path> <analysis-json>",
  "  vibe image revise <asset-id> <analysis-json>",
  "  vibe conversation prepare <input-json>",
  "  vibe memory <exact-learning-asset-id>",
  "  vibe creator prepare <capture-json>",
  "  vibe creator task <task-id>",
  "  vibe creator import <task-id> <analysis-json>",
  "  vibe prompts list | save <input-json> | get <id> <revision> | render <input-json>",
  "  vibe collections list | save <input-json> | get <id> | relations <selection-json>",
].join("\n");

function parseNumberOption(args, name, defaultValue) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return Number(args[index + 1]);
  }
  return defaultValue;
}

function requireArguments(args, minimum, maximum = minimum) {
  if (args.length < minimum || args.length > maximum
    || args.some(value => typeof value !== "string" || !value.trim() || value.startsWith("--"))) {
    throw new Error("命令参数数量或格式无效，请使用 vibe --help 查看用法。");
  }
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runCli(argv, options = {}) {
  const [, , command, rawTarget] = argv;
  const target = rawTarget?.startsWith("--") ? undefined : rawTarget;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (command === "--help" || command === "-h") {
    stdout.write(`${usage}\n`);
    return { exitCode: 0 };
  }

  if (command === 'context') {
    const args = argv.slice(3);
    requireArguments(args, 1);
    const result = await createTaskContext(resolveAssetLibraryRoot(), await readJsonFile(args[0]));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return { exitCode: 0 };
  }

  if (command === 'memory') {
    const args=argv.slice(3);requireArguments(args,1);
    stdout.write(JSON.stringify(await getLearningMemory(resolveAssetLibraryRoot(),{assetId:args[0]}),null,2)+'\n');
    return {exitCode:0};
  }
  if (['conversation','creator','prompts','collections'].includes(command)) {
    const args=argv.slice(4);const root=resolveAssetLibraryRoot();let result;
    if(command==='conversation'&&rawTarget==='prepare'){requireArguments(args,1);result=await prepareConversation(root,await readJsonFile(args[0]));}
    else if(command==='creator'&&rawTarget==='prepare'){requireArguments(args,1);result=await prepareCreator(root,await readJsonFile(args[0]));}
    else if(command==='creator'&&rawTarget==='task'){requireArguments(args,1);result=await getCreatorTask(root,args[0]);}
    else if(command==='creator'&&rawTarget==='import'){requireArguments(args,2);result=await importCreatorAnalysis(root,args[0],await readJsonFile(args[1]));}
    else if(command==='prompts'&&rawTarget==='list'){requireArguments(args,0);result=await listPrompts(root);}
    else if(command==='prompts'&&rawTarget==='save'){requireArguments(args,1);result=await savePrompt(root,await readJsonFile(args[0]));}
    else if(command==='prompts'&&rawTarget==='get'){requireArguments(args,2);result=await getPrompt(root,args[0],args[1]);}
    else if(command==='prompts'&&rawTarget==='render'){requireArguments(args,1);result=await renderPrompt(root,await readJsonFile(args[0]));}
    else if(command==='collections'&&rawTarget==='list'){requireArguments(args,0);result=await listKnowledgeCollections(root);}
    else if(command==='collections'&&rawTarget==='save'){requireArguments(args,1);result=await saveKnowledgeCollection(root,await readJsonFile(args[0]));}
    else if(command==='collections'&&rawTarget==='get'){requireArguments(args,1);result=await getKnowledgeCollection(root,args[0]);}
    else if(command==='collections'&&rawTarget==='relations'){requireArguments(args,1);result=await exploreAssetRelations(root,await readJsonFile(args[0]));}
    else throw new Error('未知子命令，请使用 vibe --help 查看用法。');
    stdout.write(JSON.stringify(result,null,2)+'\n');return {exitCode:0};
  }

  if (command === 'image') {
    const args = argv.slice(4);
    let result;
    if (rawTarget === 'inspect') {
      requireArguments(args, 1);
      result = await inspectImage(args[0]);
    } else if (rawTarget === 'import') {
      requireArguments(args, 2);
      result = await importImageAnalysis(resolveAssetLibraryRoot(), { imagePath: args[0], analysis: await readJsonFile(args[1]) });
    } else if (rawTarget === 'revise') {
      requireArguments(args,2);
      result=await reviseImageAnalysis(resolveAssetLibraryRoot(),{assetId:args[0],analysis:await readJsonFile(args[1])});
    } else {
      throw new Error('未知图片子命令，请使用 vibe --help 查看用法。');
    }
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return { exitCode: 0 };
  }

  if (command === "learn" || command === "recipes") {
    const args = argv.slice(4);
    const libraryRoot = resolveAssetLibraryRoot();
    let result;
    if (command === "learn" && rawTarget === "prepare") {
      requireArguments(args, 1, 2);
      const source = await readJsonFile(args[0]);
      if (source?.kind !== "conversation" && source?.kind !== "text") throw new Error("学习材料 kind 只支持 conversation 或 text。");
      const recipeId = args[1] ?? (source.kind === "conversation" ? "conversation-learning" : "general-knowledge");
      result = await prepareLearning(libraryRoot, { source, recipeId });
    } else if (command === "learn" && rawTarget === "import") {
      requireArguments(args, 2);
      result = await importLearningAnalysis(libraryRoot, args[0], await readJsonFile(args[1]));
    } else if (command === "learn" && rawTarget === "tasks") {
      requireArguments(args, 0);
      result = await listLearningTasks(libraryRoot);
    } else if (command === "recipes" && rawTarget === "list") {
      requireArguments(args, 0);
      result = await listRecipes(libraryRoot);
    } else if (command === "recipes" && rawTarget === "save") {
      requireArguments(args, 1);
      result = await saveRecipe(libraryRoot, await readJsonFile(args[0]));
    } else {
      throw new Error("未知学习或方案子命令，请使用 vibe --help 查看用法。");
    }
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return { exitCode: 0 };
  }

  if (command === "distill") {
    const args = argv.slice(target ? 4 : 3);
    const selection = {};
    for (let index = 0; index < args.length; index += 2) {
      const field = { '--recipe': 'recipeId', '--recipe-version': 'recipeVersion' }[args[index]];
      const value = args[index + 1];
      if (!field || !value || value.startsWith('--') || Object.hasOwn(selection, field)) throw new Error('工程方案参数未知、重复或缺少值。');
      selection[field] = field === 'recipeVersion' ? Number(value) : value;
    }
    if (selection.recipeVersion !== undefined && (!selection.recipeId || !Number.isSafeInteger(selection.recipeVersion) || selection.recipeVersion < 1)) throw new Error('方案版本必须为正整数，并同时指定 --recipe。');
    const result = await (options.distillProject ?? distillProject)(target ?? ".", selection);
    stdout.write(`VibeHub generated ${result.outputDir}\n`);
    stdout.write(`源码索引：${result.analysis.files} 个文件，解析 ${result.analysis.parsed} 个，复用 ${result.analysis.reused} 个。\n`);
    return { exitCode: 0 };
  }

  if (command === "distill-website") {
    if (!target || argv.length !== 4) throw new Error("Website capture directory is required; no additional arguments allowed.");
    const result = await (options.distillWebsite ?? distillWebsite)(target);
    stdout.write(`网站控件已入库：${result.outputDir}\n控件 ${result.components} 个。请在 Web 中核验逐控件效果。\n`);
    return { exitCode: 0 };
  }

  if (command === "distill-book") {
    if (!target) throw new Error("Book path is required.");
    const args = argv.slice(4);
    if (args.length > 0) {
      if (args.length !== 2 || !["--prepare", "--analysis"].includes(args[0]) || !args[1]?.trim() || args[1].startsWith("--")) {
        throw new Error("书籍参数只允许单独使用 --prepare <新工作目录> 或 --analysis <分析JSON>，两个选项不能混用。");
      }
      if (args[0] === "--prepare") {
        const prepare = options.prepareBookKnowledge ?? prepareBookKnowledge;
        const result = await prepare(target, args[1]);
        stdout.write(`书籍阅读任务已准备：${result.outputDir}\n请让 AI 阅读 book-task.md 和全部分块，语义分析尚未完成。\n`);
      } else {
        const importAnalysis = options.importBookKnowledge ?? importBookKnowledge;
        const result = await importAnalysis(target, args[1]);
        stdout.write(`书籍知识资产已生成：${result.outputDir}\n实体 ${result.asset.entities.length} 个，关系 ${result.asset.relations.length} 条。来源核验不等于内容判真。\n`);
      }
      return { exitCode: 0 };
    }
    const distill = options.distillBook ?? distillBook;
    const result = await distill(target);
    stdout.write(`VibeHub generated ${result.outputDir}\n`);
    stdout.write("当前是预设词表的基础统计；世界观、角色卡和语义网络请使用 --prepare / --analysis 流程。\n");
    return { exitCode: 0 };
  }

  if (command === "web") {
    const start = options.startWebServer ?? startWebServer;
    const args = argv.slice(target ? 4 : 3);
    const { url } = await start(target, { port: parseNumberOption(args, "--port", 4317) });
    stdout.write(`VibeHub web is running at ${url}\n`);
    return { exitCode: 0 };
  }

  stderr.write(`${usage}\n`);
  return { exitCode: 1 };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv)
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
