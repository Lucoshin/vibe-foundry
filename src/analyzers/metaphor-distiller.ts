import {
  createMetaphorPack,
  slugifyMetaphorSource,
} from "../schema/metaphor-pack.js";

const metaphorSignals = [
  {
    name: "library",
    keywords: ["library", "archive", "memory palace"],
    meaning: "Knowledge as rooms, shelves, and retrievable memory.",
    visualMotifs: ["shelves", "rooms", "index cards"],
    interactionIdeas: ["spatial browsing", "saved paths", "return-to-place navigation"],
    productApplications: ["knowledge bases", "research tools", "asset catalogs"],
  },
  {
    name: "compass",
    keywords: ["compass", "navigate", "navigation", "wayfinding"],
    meaning: "Guidance through uncertainty toward the right next direction.",
    visualMotifs: ["direction markers", "north star", "route lines"],
    interactionIdeas: ["next-best-action prompts", "orientation checkpoints"],
    productApplications: ["onboarding", "dashboards", "decision support"],
  },
  {
    name: "forge",
    keywords: ["forge", "craft", "smith", "refine", "transformation"],
    meaning: "Raw material becomes durable value through repeated craft.",
    visualMotifs: ["workbench", "heat", "tools"],
    interactionIdeas: ["iteration stages", "before-after transforms"],
    productApplications: ["creation tools", "AI refinement workflows"],
  },
  {
    name: "garden",
    keywords: ["garden", "cultivate", "seed", "grow"],
    meaning: "Systems improve through patient cultivation and care.",
    visualMotifs: ["growth rings", "beds", "seasonal states"],
    interactionIdeas: ["progressive nurturing", "health indicators"],
    productApplications: ["community products", "learning systems"],
  },
  {
    name: "journey",
    keywords: ["journey", "path", "quest", "pilgrimage"],
    meaning: "Progress as a sequence of meaningful thresholds.",
    visualMotifs: ["maps", "milestones", "gates"],
    interactionIdeas: ["milestone tracking", "chaptered flows"],
    productApplications: ["onboarding", "education", "project management"],
  },
];

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function containsAny(text, keywords) {
  const normalized = normalize(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function shortReference(source) {
  return `user note: ${slugifyMetaphorSource(source)}`.slice(0, 120);
}

function emotionalToneFrom(text) {
  const tones = [];
  if (containsAny(text, ["calm", "quiet", "archival"])) {
    tones.push("calm");
  }
  if (containsAny(text, ["curious", "wonder", "explore"])) {
    tones.push("curious");
  }
  if (containsAny(text, ["craft", "forge", "precision"])) {
    tones.push("crafted");
  }
  return tones;
}

function archetypesFrom(metaphors) {
  const archetypes = new Set(metaphors.length > 0 ? ["guide"] : []);
  if (metaphors.some((metaphor) => metaphor.name === "forge")) {
    archetypes.add("craftsperson");
  }
  if (metaphors.some((metaphor) => metaphor.name === "library")) {
    archetypes.add("archivist");
  }
  if (metaphors.some((metaphor) => metaphor.name === "journey")) {
    archetypes.add("seeker");
  }
  return [...archetypes].sort();
}

function namingSystemFrom(metaphors) {
  const names = new Set();
  for (const metaphor of metaphors) {
    names.add(`${metaphor.name} map`);
    names.add(`${metaphor.name} path`);
  }
  return [...names].sort();
}

export function distillMetaphorPack(options) {
  const matchedSignals = metaphorSignals.filter((signal) =>
    containsAny(options.text, signal.keywords),
  );
  const matchedMetaphors = matchedSignals.map((signal) => ({
    name: signal.name,
    meaning: signal.meaning,
  }));

  return createMetaphorPack({
    source: options.source,
    sourceType: options.sourceType,
    coreMetaphors: matchedMetaphors,
    archetypes: archetypesFrom(matchedMetaphors),
    namingSystem: namingSystemFrom(matchedMetaphors),
    visualMotifs: [...new Set(matchedSignals.flatMap((signal) => signal.visualMotifs))],
    interactionIdeas: [...new Set(matchedSignals.flatMap((signal) => signal.interactionIdeas))],
    emotionalTone: emotionalToneFrom(options.text),
    productApplications: [
      ...new Set(matchedSignals.flatMap((signal) => signal.productApplications)),
    ],
    sourceReferences: [shortReference(options.source)],
  });
}

export function distillMetaphorPacks(files) {
  return files.map((file) =>
    distillMetaphorPack({
      source: file.source ?? file.filePath.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
      sourceType: file.sourceType ?? "user-notes",
      text: file.text,
    }),
  );
}
