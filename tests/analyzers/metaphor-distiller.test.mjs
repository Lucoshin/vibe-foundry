import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { distillMetaphorPack } from "../../dist/analyzers/metaphor-distiller.js";
import { createMetaphorPack } from "../../dist/schema/metaphor-pack.js";

describe("distillMetaphorPack", () => {
  it("distills a short owned note into a reusable metaphor pack", () => {
    const pack = distillMetaphorPack({
      source: "memory palace notes",
      sourceType: "user-notes",
      text: [
        "The product can feel like a library and memory palace.",
        "Users move through rooms, collect signals, and use a compass to return to the right idea.",
        "The emotional tone should be calm, archival, and curious.",
      ].join("\n"),
    });

    assert.equal(pack.source, "memory palace notes");
    assert.equal(pack.sourceType, "user-notes");
    assert.ok(pack.coreMetaphors.some((item) => item.name === "library"));
    assert.ok(pack.coreMetaphors.some((item) => item.name === "compass"));
    assert.ok(pack.archetypes.length > 0);
    assert.ok(pack.namingSystem.length > 0);
    assert.ok(pack.visualMotifs.length > 0);
    assert.ok(pack.interactionIdeas.length > 0);
    assert.ok(pack.productApplications.length > 0);
    assert.match(pack.copyrightNotes, /不保存长段原文/);
  });

  it("keeps source references short instead of storing long source text", () => {
    const longSentence =
      "This deliberately long sentence should not be copied into source references because metaphor packs must store structured insight rather than long copyrighted source text or complete passages.";
    const pack = distillMetaphorPack({
      source: "long note",
      sourceType: "user-notes",
      text: `${longSentence} The forge metaphor suggests transformation through craft.`,
    });

    assert.ok(pack.sourceReferences.length > 0);
    assert.ok(pack.sourceReferences.every((reference) => reference.length <= 120));
    assert.ok(!JSON.stringify(pack).includes(longSentence));
  });
});

describe("createMetaphorPack", () => {
  it("creates the full metaphor pack shape required by Milestone 9", () => {
    const pack = createMetaphorPack({
      source: "forge notes",
      sourceType: "user-notes",
      coreMetaphors: [{ name: "forge", meaning: "Transformation through craft" }],
      sourceReferences: ["user note: forge notes"],
    });

    assert.equal(pack.source, "forge notes");
    assert.equal(pack.sourceType, "user-notes");
    assert.deepEqual(Object.keys(pack), [
      "source",
      "sourceType",
      "coreMetaphors",
      "archetypes",
      "namingSystem",
      "visualMotifs",
      "interactionIdeas",
      "emotionalTone",
      "productApplications",
      "sourceReferences",
      "copyrightNotes",
    ]);
  });
});
