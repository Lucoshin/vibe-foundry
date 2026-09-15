import { parse as parseVueSfc } from "@vue/compiler-sfc";

import { listFiles, readTextFile } from "../utils/files.js";

const staticClassPattern = /\b(?:className|class)\s*=\s*["']([^"']+)["']/g;

function tokenCategory(token) {
  if (/^(bg|text|border|ring)-/.test(token) && !/^text-(xs|sm|base|lg|xl|\d)/.test(token)) {
    return "color";
  }
  if (/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space)-/.test(token)) {
    return "spacing";
  }
  if (/^rounded/.test(token)) {
    return "radius";
  }
  if (/^shadow/.test(token)) {
    return "shadow";
  }
  if (/^text-(xs|sm|base|lg|xl|\d)/.test(token)) {
    return "font-size";
  }
  return null;
}

function extractClassTokens(sourceText) {
  const tokens = [];
  for (const match of sourceText.matchAll(staticClassPattern)) {
    tokens.push(...match[1].split(/\s+/).filter(Boolean));
  }
  return tokens;
}

function variableCategory(name, value) {
  const normalized = name.toLowerCase();
  if (/color|colour|background|foreground|surface|primary|secondary|accent/.test(normalized)) return "color";
  if (/radius|rounded/.test(normalized)) return "radius";
  if (/shadow|elevation/.test(normalized)) return "shadow";
  if (/font.*size|text.*size/.test(normalized)) return "font-size";
  if (/space|spacing|gap|padding|margin/.test(normalized)) return "spacing";
  if (/^#|^(?:rgb|hsl|oklch|color)\(/i.test(value)) return "color";
  return "other";
}

function styleVariableTokens(sourceText, extension, scopeOverride = "") {
  const tokens = [];
  if (extension === ".css") {
    for (const block of sourceText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const scope = scopeOverride || block[1].trim().replace(/\s+/g, " ");
      for (const declaration of block[2].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+)\s*;?/g)) {
        const name = declaration[1];
        const value = declaration[2].trim();
        tokens.push({ name, value, syntax: "css-variable", scope });
      }
    }
  }
  if ([".scss", ".sass"].includes(extension)) {
    for (const declaration of sourceText.matchAll(/^\s*(\$[A-Za-z0-9_-]+)\s*:\s*([^;\r\n]+)\s*;?/gm)) {
      tokens.push({ name: declaration[1], value: declaration[2].trim(), syntax: "sass-variable", scope: scopeOverride || "module" });
    }
  }
  if (extension === ".less") {
    for (const declaration of sourceText.matchAll(/^\s*(@[A-Za-z0-9_-]+)\s*:\s*([^;\r\n]+)\s*;?/gm)) {
      tokens.push({ name: declaration[1], value: declaration[2].trim(), syntax: "less-variable", scope: scopeOverride || "module" });
    }
  }
  return tokens;
}

function variableTokens(sourceText, filePath) {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (extension !== ".vue") return styleVariableTokens(sourceText, extension);
  const { descriptor } = parseVueSfc(sourceText, { filename: filePath });
  return descriptor.styles.flatMap((style) => styleVariableTokens(
    style.content,
    `.${style.lang ?? "css"}`,
    style.scoped ? "component:scoped" : "component",
  ));
}

export async function extractTokens(projectRoot, sourceDirs, options = {}) {
  const files = await listFiles(projectRoot, sourceDirs, [
    ".tsx", ".jsx", ".ts", ".js", ".vue", ".css", ".scss", ".sass", ".less",
  ]);
  const tokenMap = new Map();
  const sourceTexts = new Map((options.sourceIndex?.files ?? []).map((file) => [file.filePath, file.sourceText]));

  for (const file of files) {
    const sourceText = sourceTexts.has(file.filePath) ? sourceTexts.get(file.filePath) : await readTextFile(file.fullPath);
    for (const variable of variableTokens(sourceText, file.filePath)) {
      const key = `${variable.syntax}:${variable.scope}:${variable.name}:${variable.value}`;
      const existing = tokenMap.get(key) ?? {
        ...variable,
        kind: "design-token",
        category: variableCategory(variable.name, variable.value),
        occurrences: 0,
        sourceFiles: [],
      };
      existing.occurrences += 1;
      if (!existing.sourceFiles.includes(file.filePath)) existing.sourceFiles.push(file.filePath);
      tokenMap.set(key, existing);
    }
    for (const tokenName of extractClassTokens(sourceText)) {
      const category = tokenCategory(tokenName);
      if (!category) {
        continue;
      }
      const key = `class:${tokenName}`;
      const existing = tokenMap.get(key) ?? {
        name: tokenName,
        kind: "design-token",
        category,
        occurrences: 0,
        sourceFiles: [],
      };
      existing.occurrences += 1;
      if (!existing.sourceFiles.includes(file.filePath)) {
        existing.sourceFiles.push(file.filePath);
      }
      tokenMap.set(key, existing);
    }
  }

  return [...tokenMap.values()].sort((left, right) => left.name.localeCompare(right.name));
}
