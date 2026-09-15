#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { distillProject } from "./index.js";
import { distillBook } from "./analyzers/book-distiller.js";
import { importBookKnowledge, prepareBookKnowledge } from "./analyzers/book-knowledge-workflow.js";
import { startWebServer } from "./web/server.js";

const usage = [
  "Usage:",
  "  vibe-foundry distill <project-root>",
  "  vibe-foundry distill-book <book-path>",
  "  vibe-foundry distill-book <book-path> --prepare <new-work-dir>",
  "  vibe-foundry distill-book <book-path> --analysis <analysis-json>",
  "  vibe-foundry web <project-root> [--port <port>]",
].join("\n");

function parseNumberOption(args, name, defaultValue) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    return Number(args[index + 1]);
  }
  return defaultValue;
}

export async function runCli(argv, options = {}) {
  const [, , command, rawTarget] = argv;
  const target = rawTarget?.startsWith("--") ? undefined : rawTarget;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (command === "distill") {
    const result = await distillProject(target ?? ".");
    stdout.write(`VibeFoundry generated ${result.outputDir}\n`);
    stdout.write(`源码索引：${result.analysis.files} 个文件，解析 ${result.analysis.parsed} 个，复用 ${result.analysis.reused} 个。\n`);
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
    stdout.write(`VibeFoundry generated ${result.outputDir}\n`);
    stdout.write("当前是预设词表的基础统计；世界观、角色卡和语义网络请使用 --prepare / --analysis 流程。\n");
    return { exitCode: 0 };
  }

  if (command === "web") {
    const start = options.startWebServer ?? startWebServer;
    const args = argv.slice(target ? 4 : 3);
    const { url } = await start(target, { port: parseNumberOption(args, "--port", 4317) });
    stdout.write(`VibeFoundry web is running at ${url}\n`);
    return { exitCode: 0 };
  }

  stderr.write(`${usage}\n`);
  return { exitCode: 1 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv)
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
