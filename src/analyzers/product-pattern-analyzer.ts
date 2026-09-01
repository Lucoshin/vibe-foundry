import {
  createConceptAsset,
  supportedProductPatternTypes,
} from "../schema/concept-assets.js";

const patternSignals = [
  {
    patternType: "onboarding",
    keywords: ["onboarding", "first-time", "first time", "setup", "getting started"],
    paths: [/onboarding|getting-started|welcome/i],
  },
  {
    patternType: "pricing",
    keywords: ["pricing", "plan comparison", "subscription", "billing plan"],
    paths: [/pricing|plans/i],
  },
  {
    patternType: "dashboard",
    keywords: ["dashboard", "overview", "recent activity", "metrics"],
    paths: [/dashboard|overview/i],
  },
  {
    patternType: "settings",
    keywords: ["settings", "preferences", "configuration", "account management"],
    paths: [/settings|preferences/i],
  },
  {
    patternType: "invite",
    keywords: ["invite", "invitation", "teammates", "referral"],
    paths: [/invite|referral/i],
  },
  {
    patternType: "content-creation",
    keywords: ["content creation", "create content", "draft", "publish"],
    paths: [/editor|create|compose|publish/i],
  },
  {
    patternType: "empty-state",
    keywords: ["empty state", "no items", "no projects", "first action"],
    paths: [/empty/i],
  },
  {
    patternType: "upgrade-prompt",
    keywords: ["upgrade prompt", "upgrade", "premium", "paywall"],
    paths: [/upgrade|premium/i],
  },
  {
    patternType: "user-activation",
    keywords: ["user activation", "activation", "activate", "aha moment"],
    paths: [/activation/i],
  },
];

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function hasKeyword(text, keywords) {
  const normalized = normalize(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasPathSignal(filePath, paths) {
  return paths.some((pattern) => pattern.test(filePath));
}

export { supportedProductPatternTypes };

export async function analyzeProductPatterns(files) {
  const sourcesByPattern = new Map();

  for (const file of files) {
    for (const signal of patternSignals) {
      if (
        hasPathSignal(file.filePath, signal.paths) ||
        hasKeyword(file.text, signal.keywords)
      ) {
        const sources = sourcesByPattern.get(signal.patternType) ?? new Set();
        sources.add(file.filePath);
        sourcesByPattern.set(signal.patternType, sources);
      }
    }
  }

  return [...sourcesByPattern.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([patternType, sourceFiles]) =>
      createConceptAsset({
        patternType,
        sourceFiles: [...sourceFiles].sort(),
      }),
    );
}
