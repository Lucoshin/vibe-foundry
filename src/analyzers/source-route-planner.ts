import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parse } from "@babel/parser";

import { buildFrontendSourceIndex } from "./frontend-source-index.js";

function propertyName(property) {
  return property?.key?.name ?? property?.key?.value ?? "";
}

function stringLiteralProperty(object, name) {
  const property = object?.properties?.find((item) =>
    item.type === "ObjectProperty" && !item.computed && propertyName(item) === name,
  );
  return property?.value?.type === "StringLiteral" ? property.value.value : "";
}

function hasProperty(object, name) {
  return object?.properties?.some((item) =>
    item.type === "ObjectProperty" && !item.computed && propertyName(item) === name,
  );
}

function jsxElementName(node) {
  return node?.openingElement?.name?.type === "JSXIdentifier"
    ? node.openingElement.name.name
    : "";
}

function guardedElement(name) {
  return /(?:Protected|Private|Auth|Guard|Permission|Secure)/i.test(name);
}

function parseRouteSource(sourceText, filePath) {
  const ast = parse(sourceText, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: true,
  });
  const routes = [];
  let unresolved = false;
  const reactRouteNames = new Set();
  let hasVueRouterImport = false;
  for (const statement of ast.program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.source.value === "react-router-dom") {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier" && specifier.imported?.name === "Route") {
          reactRouteNames.add(specifier.local.name);
        }
      }
    }
    if (statement.source.value === "vue-router") hasVueRouterImport = true;
  }

  function visit(node, guarded = false) {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXElement") {
      const name = jsxElementName(node);
      const nextGuarded = guarded || guardedElement(name);
      if (reactRouteNames.has(name)) {
        const pathAttribute = node.openingElement.attributes.find((attribute) =>
          attribute.type === "JSXAttribute" && attribute.name?.name === "path",
        );
        if (!nextGuarded && pathAttribute?.value?.type === "StringLiteral") {
          routes.push({
            route: pathAttribute.value.value,
            sourceFile: filePath,
            evidence: "react-router-static-path",
          });
        } else {
          unresolved = true;
        }
      }
      for (const child of node.children ?? []) visit(child, nextGuarded);
      return;
    }
    if (
      node.type === "VariableDeclarator"
      && hasVueRouterImport
      && node.id?.type === "Identifier"
      && /routes/i.test(node.id.name)
      && node.init?.type === "ArrayExpression"
    ) {
      for (const element of node.init.elements) {
        if (element?.type !== "ObjectExpression") continue;
        const path = stringLiteralProperty(element, "path");
        if (path && hasProperty(element, "component")) {
          routes.push({ route: path, sourceFile: filePath, evidence: "vue-router-static-path" });
        } else if (hasProperty(element, "path")) {
          unresolved = true;
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) visit(child, guarded);
      } else if (value && typeof value === "object") {
        visit(value, guarded);
      }
    }
  }

  visit(ast.program);
  return { routes, unresolved };
}

function nextRouteFor(filePath) {
  const match = filePath.match(/^src\/app\/(.*\/)?page\.[jt]sx?$/);
  if (!match) return null;
  const segments = (match[1] ?? "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  if (segments.some((segment) => segment.includes("[") || segment.includes("]"))) {
    return { unresolved: true };
  }
  return { route: segments.length > 0 ? `/${segments.join("/")}` : "/" };
}

async function uniRoutes(projectRoot) {
  try {
    const pages = JSON.parse(await readFile(join(projectRoot, "pages.json"), "utf8"));
    return (pages.pages ?? [])
      .filter((page) => typeof page?.path === "string" && page.path)
      .map((page) => ({
        route: `/${page.path.replace(/^\/+/, "")}`,
        sourceFile: "pages.json",
        evidence: "uni-pages-json",
      }));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function planSourceRoutes(projectRoot, sourceDirs = ["src"], options = {}) {
  const index = options.sourceIndex ?? await buildFrontendSourceIndex(projectRoot, sourceDirs);
  const routes = [];
  const unresolvedFiles = new Set();
  for (const file of index.files) {
    const next = nextRouteFor(file.filePath);
    if (next?.route) {
      routes.push({ route: next.route, sourceFile: file.filePath, evidence: "next-app-page" });
    } else if (next?.unresolved) {
      unresolvedFiles.add(file.filePath);
    }
    if (![".js", ".jsx", ".ts", ".tsx"].includes(extname(file.filePath))) continue;
    if (!file.dependencies.some((dependency) => ["react-router-dom", "vue-router"].includes(dependency.source))) continue;
    const parsed = parseRouteSource(file.sourceText, file.filePath);
    routes.push(...parsed.routes);
    if (parsed.unresolved) unresolvedFiles.add(file.filePath);
  }
  routes.push(...await uniRoutes(projectRoot));
  const uniqueRoutes = [...new Map(routes.map((item) => [
    `${item.route}\0${item.sourceFile}\0${item.evidence}`,
    item,
  ])).values()].sort((left, right) =>
    left.route.localeCompare(right.route) || left.sourceFile.localeCompare(right.sourceFile),
  );
  return {
    routes: uniqueRoutes,
    unresolved: [...unresolvedFiles].sort().map((sourceFile) => ({
      sourceFile,
      reason: "dynamic-or-guarded-route",
    })),
  };
}
