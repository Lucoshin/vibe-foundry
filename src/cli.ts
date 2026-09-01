#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { distillProject } from "./index.js";
import { distillBook } from "./analyzers/book-distiller.js";
import { startWebServer } from "./web/server.js";

const usage = [
  "Usage:",
  "  vibe-foundry distill <project-root>",
  "  vibe-foundry distill-book <book-path>",
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
    return { exitCode: 0 };
  }

  if (command === "distill-book") {
    if (!target) throw new Error("Book path is required.");
    const distill = options.distillBook ?? distillBook;
    const result = await distill(target);
    stdout.write(`VibeFoundry generated ${result.outputDir}\n`);
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
