import { loadAssetLibraryViewModel, queryAssets } from "../application/asset-catalog.js";
import { createTaskContext } from "../application/task-context.js";
import {getLearningMemory} from '../learning/memory.js';
import {getCreatorTask} from '../learning/creators.js';
import {listPrompts,getPrompt,renderPrompt} from '../prompts/workflow.js';
import {listKnowledgeCollections,getKnowledgeCollection,exploreAssetRelations} from '../application/knowledge-collections.js';
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readComponentPrompt } from "../library/component-prompts.js";

import {
  assetPackageDirectoryFor,
  resolveAssetLibraryRoot,
} from "../library/asset-library.js";

const toolDefinitions = [
  ...[
    ['list_prompts','List immutable reusable prompt versions and read errors.',{},[]],
    ['get_prompt','Read one exact reusable prompt version.',{id:{type:'string'},revision:{type:'string'}},['id','revision']],
    ['render_prompt','Render declared template variables once without executing a model.',{id:{type:'string'},revision:{type:'string'},values:{type:'object',additionalProperties:{type:'string'}}},['id','revision','values']],
    ['list_knowledge_collections','List manually maintained asset reference collections.',{},[]],
    ['get_knowledge_collection','Read exact collection members including missing references.',{id:{type:'string'}},['id']],
    ['explore_asset_relations','Read existing evidenced one-hop relations without inferring links.',{assetIds:{type:'array',items:{type:'string'},minItems:1,maxItems:100,uniqueItems:true}},['assetIds']],
    ['get_learning_memory','Read evidence, declared applications and other result versions of exact learning asset.',{assetId:{type:'string'}},['assetId']],
    ['get_creator_task','Read frozen creator capture, sampling limits and transcript availability.',{taskId:{type:'string'}},['taskId']],
  ].map(([name,description,properties,required])=>({name,description,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},inputSchema:{type:'object',properties,required,additionalProperties:false}})),
  {
    name: "create_task_context",
    description: "Build a bounded, read-only task context from an explicit goal and 1–10 exact shared asset IDs. Returns source content, evidence, limitations, revisions or content digests, and copyable Markdown. Proposed use only; does not record adoption or execute work.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", minLength: 1, maxLength: 4000 },
        assetIds: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 10, uniqueItems: true },
      },
      required: ["goal", "assetIds"], additionalProperties: false,
    },
  },
  {name:'search_library_assets',description:'Search all registered project, website, book and learning assets with shared identities. Read-only. Preview statuses come from the registry snapshot, not live runtime state.',inputSchema:{type:'object',properties:{query:{type:'string'},kind:{type:'string'},sourceId:{type:'string'},language:{type:'string'}},additionalProperties:false}},
  {name:'get_library_asset',description:'Read an asset by its exact shared library ID, including evidence, relationships and source read errors. Preview statuses come from the registry snapshot, not live runtime state.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
  {
    name: "list_assets",
    description: "List VibeHub asset package metadata and asset counts.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_component",
    description: "Get one component asset by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_component_prompt",
    description: "Read a Chinese natural-language design prompt describing a component's layout, visual effects, and interactions by its exact project-relative filePath. Copy only prompt; sourceFiles and unresolved contain separate analysis evidence and review items.",
    inputSchema: {
      type: "object",
      properties: { filePath: { type: "string", minLength: 1 } },
      required: ["filePath"],
      additionalProperties: false,
    },
  },
  {
    name: "get_service",
    description: "Get one service asset by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "search_tokens",
    description: "Search design tokens by name or category.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_business_patterns",
    description: "Search business patterns by name, domain, entrypoint, or guidance.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_concept_assets",
    description: "Search product concept assets and metaphor packs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_agent_rules",
    description: "Read the generated VibeHub agent rules.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "validate_asset_usage",
    description: "Validate whether a named asset exists before reuse.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["component", "service", "token", "business-pattern", "concept"],
        },
        name: { type: "string" },
      },
      required: ["kind", "name"],
      additionalProperties: false,
    },
  },
];

const missingAssetPackageMessage =
  "Missing centralized asset package. Run `vibe distill .` or `node dist/cli.js distill .` from the project root first.";

function textResult(structuredContent, options = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
    isError: Boolean(options.isError),
  };
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function includesQuery(value, query) {
  if (!query) {
    return true;
  }
  return normalize(value).includes(normalize(query));
}

function objectIncludesQuery(value, query) {
  if (!query) {
    return true;
  }
  return includesQuery(JSON.stringify(value), query);
}

function conceptSearchRank(asset, query) {
  if (!query) {
    return 0;
  }
  if (includesQuery(asset.patternType, query) || includesQuery(asset.name, query)) {
    return 0;
  }
  return 1;
}

async function readAssetText(assetDir, fileName) {
  return readFile(join(assetDir, fileName), "utf8");
}

async function readAssetJson(assetDir, fileName) {
  return JSON.parse(await readAssetText(assetDir, fileName));
}

async function loadAssetPackage(projectRoot, options = {}) {
  const assetDir = assetPackageDirectoryFor(
    resolveAssetLibraryRoot(options.assetLibraryRoot),
    resolve(projectRoot),
  );
  try {
    const [manifest, componentCatalog, serviceCatalog, tokenCatalog, conceptCatalog] =
      await Promise.all([
        readAssetJson(assetDir, "asset-manifest.json"),
        readAssetJson(assetDir, "component-catalog.json"),
        readAssetJson(assetDir, "service-catalog.json"),
        readAssetJson(assetDir, "tokens.json"),
        readAssetJson(assetDir, "concept-assets.json"),
      ]);
    return {
      assetDir,
      manifest,
      components: componentCatalog.components ?? [],
      services: serviceCatalog.services ?? [],
      businessPatterns: serviceCatalog.businessPatterns ?? [],
      tokens: tokenCatalog.tokens ?? [],
      conceptAssets: conceptCatalog.conceptAssets ?? [],
      metaphorPacks: conceptCatalog.metaphorPacks ?? [],
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { error: missingAssetPackageMessage };
    }
    throw error;
  }
}

async function withAssetPackage(projectRoot, handler, options = {}) {
  const assetPackage = await loadAssetPackage(projectRoot, options);
  if (assetPackage.error) {
    return textResult({ message: assetPackage.error }, { isError: true });
  }
  return handler(assetPackage);
}

function findByName(items, name) {
  return items.find((item) => normalize(item.name) === normalize(name));
}

function validateAsset(assetPackage, args = {}) {
  const kind = args.kind;
  const name = args.name;
  const collections = {
    component: assetPackage.components,
    service: assetPackage.services,
    token: assetPackage.tokens,
    "business-pattern": assetPackage.businessPatterns,
    concept: assetPackage.conceptAssets,
  };
  const collection = collections[kind] ?? [];
  const asset = findByName(collection, name);
  const exists = Boolean(asset);
  const guidance = exists
    ? [`${kind} asset \`${name}\` exists. Review source, constraints, and generated guidance before reuse.`]
    : [`${kind} asset \`${name}\` was not found. Run VibeHub distill again or choose another asset.`];

  return { exists, kind, name, asset: asset ?? null, guidance };
}

export function listVibeHubTools() {
  return toolDefinitions.map((tool) => ({
    ...tool,
    inputSchema: { ...tool.inputSchema },
  }));
}

export async function callVibeHubTool(projectRoot, toolName, args = {}, options = {}) {
  if(['list_prompts','get_prompt','render_prompt','list_knowledge_collections','get_knowledge_collection','explore_asset_relations','get_learning_memory','get_creator_task'].includes(toolName)) {
    try {
      const schema=toolDefinitions.find(tool=>tool.name===toolName).inputSchema;
      if(!args||typeof args!=='object'||Array.isArray(args)||![Object.prototype,null].includes(Object.getPrototypeOf(args))||Object.keys(args).some(key=>!Object.hasOwn(schema.properties,key))||schema.required.some(key=>!Object.hasOwn(args,key))) throw new Error('工具参数存在缺失或未知字段。');
      const root=resolveAssetLibraryRoot(options.assetLibraryRoot);let result;
      if(toolName==='list_prompts') result=await listPrompts(root);
      else if(toolName==='get_prompt') result=await getPrompt(root,args.id,args.revision);
      else if(toolName==='render_prompt') result=await renderPrompt(root,args);
      else if(toolName==='list_knowledge_collections') result=await listKnowledgeCollections(root);
      else if(toolName==='get_knowledge_collection') result=await getKnowledgeCollection(root,args.id);
      else if(toolName==='explore_asset_relations') result=await exploreAssetRelations(root,args);
      else if(toolName==='get_learning_memory') result=await getLearningMemory(root,args);
      else result=await getCreatorTask(root,args.taskId);
      return textResult(result);
    }catch(error){return textResult({message:error.message},{isError:true});}
  }
  if (toolName === "create_task_context") {
    try {
      return textResult(await createTaskContext(resolveAssetLibraryRoot(options.assetLibraryRoot), args));
    } catch (error) {
      return textResult({ message: error instanceof Error ? error.message : String(error) }, { isError: true });
    }
  }
  if (['search_library_assets','get_library_asset'].includes(toolName)) {
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)
        || ![Object.prototype,null].includes(Object.getPrototypeOf(args))) throw new Error('工具参数必须为普通对象。');
      if (toolName === 'search_library_assets') queryAssets([],args);
      else if (typeof args.id !== 'string' || !args.id.trim() || Object.keys(args).some(key=>key!=='id')) throw new Error('必须提供精确资产 id，且不能包含其他字段。');
      const model = await loadAssetLibraryViewModel(resolveAssetLibraryRoot(options.assetLibraryRoot), {runtimePreviewState:false});
      if (model.isError) return textResult({message:model.message},{isError:true});
      if (toolName === 'search_library_assets') return textResult({assets:queryAssets(model.assets,args),sources:model.sources,errors:model.errors,previewStateSource:model.previewStateSource});
      return textResult({asset:model.assets.find(asset=>asset.id===args.id)||null,errors:model.errors,previewStateSource:model.previewStateSource});
    } catch (error) {
      return textResult({message:error instanceof Error?error.message:String(error)},{isError:true});
    }
  }
  const withPackage = (handler) => withAssetPackage(projectRoot, handler, options);
  switch (toolName) {
    case "list_assets":
      return withPackage((assetPackage) =>
        textResult({
          manifest: assetPackage.manifest,
          assetCounts: assetPackage.manifest.assetCounts,
          availableFiles: [
            "asset-manifest.json",
            "component-catalog.json",
            "service-catalog.json",
            "tokens.json",
            "concept-assets.json",
            "agent-rules.md",
          ],
        }),
      );

    case "get_component":
      return withPackage((assetPackage) =>
        textResult({
          component: findByName(assetPackage.components, args.name) ?? null,
        }),
      );

    case "get_component_prompt":
      if (typeof args.filePath !== "string" || !args.filePath.trim()) {
        return textResult({ message: "filePath is required to read a component prompt." }, { isError: true });
      }
      return withPackage(async (assetPackage) => {
        const filePath = args.filePath.replaceAll("\\", "/");
        const matches = assetPackage.components.filter((component) => component.filePath?.replaceAll("\\", "/") === filePath);
        if (matches.length !== 1) {
          return textResult({ message: matches.length === 0
            ? `Component not found for filePath: ${filePath}`
            : `Ambiguous component filePath: ${filePath}. Run node dist/cli.js distill <project-root> again.` }, { isError: true });
        }
        try {
          return textResult(await readComponentPrompt(assetPackage.assetDir, matches[0].filePath));
        } catch (error) {
          return textResult({ message: error instanceof Error ? error.message : String(error) }, { isError: true });
        }
      });

    case "get_service":
      return withPackage((assetPackage) =>
        textResult({
          service: findByName(assetPackage.services, args.name) ?? null,
        }),
      );

    case "search_tokens":
      return withPackage((assetPackage) =>
        textResult({
          tokens: assetPackage.tokens.filter((token) => {
            const matchesQuery =
              includesQuery(token.name, args.query) ||
              includesQuery(token.category, args.query);
            const matchesCategory = args.category
              ? normalize(token.category) === normalize(args.category)
              : true;
            return matchesQuery && matchesCategory;
          }),
        }),
      );

    case "search_business_patterns":
      return withPackage((assetPackage) =>
        textResult({
          businessPatterns: assetPackage.businessPatterns.filter((pattern) =>
            objectIncludesQuery(pattern, args.query),
          ),
        }),
      );

    case "search_concept_assets":
      return withPackage((assetPackage) =>
        textResult({
          conceptAssets: assetPackage.conceptAssets
            .filter((asset) => objectIncludesQuery(asset, args.query))
            .sort(
              (left, right) =>
                conceptSearchRank(left, args.query) -
                conceptSearchRank(right, args.query),
            ),
          metaphorPacks: assetPackage.metaphorPacks.filter((pack) =>
            objectIncludesQuery(pack, args.query),
          ),
        }),
      );

    case "get_agent_rules":
      return withPackage(async (assetPackage) =>
        textResult({
          markdown: await readAssetText(assetPackage.assetDir, "agent-rules.md"),
        }),
      );

    case "validate_asset_usage":
      return withPackage((assetPackage) =>
        textResult(validateAsset(assetPackage, args)),
      );

    default:
      return textResult(
        {
          message: `Unknown VibeHub MCP tool: ${toolName}`,
          availableTools: toolDefinitions.map((tool) => tool.name),
        },
        { isError: true },
      );
  }
}

function rpcResponse(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

export async function handleMcpRequest(projectRoot, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || !request.method) {
    return rpcError(null,-32600,'Invalid JSON-RPC request.');
  }
  if (request.method === "initialize") {
    return rpcResponse(request.id, {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "vibehub",
        version: "0.1.0",
      },
    });
  }

  if (request.method === "notifications/initialized") {
    return null;
  }

  if (request.method === "tools/list") {
    return rpcResponse(request.id, {
      tools: listVibeHubTools(),
    });
  }

  if (request.method === "tools/call") {
    try {
      const result = await callVibeHubTool(
        projectRoot,
        request.params?.name,
        request.params?.arguments === undefined ? {} : request.params.arguments,
      );
      return rpcResponse(request.id, result);
    } catch (error) {
      return rpcResponse(request.id,textResult({message:error instanceof Error?error.message:String(error)},{isError:true}));
    }
  }

  return rpcError(request.id ?? null, -32601, `Unknown MCP method: ${request.method}`);
}

function parseProjectRoot(argv) {
  const flagIndex = argv.indexOf("--project-root");
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return process.env.VIBEHUB_PROJECT_ROOT ?? process.cwd();
}

export function startMcpStdioServer(options = {}) {
  const projectRoot = options.projectRoot ?? parseProjectRoot(process.argv.slice(2));
  let buffer = "";
  let processing = Promise.resolve();

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    processing = processing.then(async () => {
      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          break;
        }
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) {
          continue;
        }
        let request;
        try {
          request = JSON.parse(line);
        } catch {
          process.stdout.write(`${JSON.stringify(rpcError(null,-32700,'Invalid JSON.'))}\n`);
          continue;
        }
        let response;
        try {
          response = await handleMcpRequest(projectRoot,request);
        } catch (error) {
          response = rpcError(request?.id ?? null,-32603,error instanceof Error?error.message:String(error));
        }
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMcpStdioServer();
}
