const defaultCopyrightNotes =
  "只保存结构化洞察、短来源引用和设计建议；不保存整本书，不保存长段原文。";

export function createMetaphorPack(options) {
  return {
    source: options.source,
    sourceType: options.sourceType,
    coreMetaphors: options.coreMetaphors ?? [],
    archetypes: options.archetypes ?? [],
    namingSystem: options.namingSystem ?? [],
    visualMotifs: options.visualMotifs ?? [],
    interactionIdeas: options.interactionIdeas ?? [],
    emotionalTone: options.emotionalTone ?? [],
    productApplications: options.productApplications ?? [],
    sourceReferences: options.sourceReferences ?? [],
    copyrightNotes: options.copyrightNotes ?? defaultCopyrightNotes,
  };
}

export function slugifyMetaphorSource(source) {
  if (typeof source !== "string" || !/[\p{L}\p{N}]/u.test(source)) {
    throw new Error("Metaphor source must contain at least one Unicode letter or number.");
  }
  return source
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
