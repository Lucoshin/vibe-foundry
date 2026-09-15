import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { distillMetaphorPack } from "../../dist/analyzers/metaphor-distiller.js";
import { createMetaphorPack, slugifyMetaphorSource } from "../../dist/schema/metaphor-pack.js";

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

  it("keeps unmatched materials empty instead of inventing metaphors", () => {
    for (const text of ["精卫填海，夸父逐日。", "An unrelated note about numbers.", ""]) {
      const pack = distillMetaphorPack({ source: "山海经", sourceType: "user-notes", text });

      for (const field of ["coreMetaphors", "archetypes", "namingSystem", "visualMotifs", "interactionIdeas", "emotionalTone", "productApplications"]) {
        assert.deepEqual(pack[field], [], `${field} must have source evidence`);
      }
      assert.equal(pack.source, "山海经");
      assert.deepEqual(pack.sourceReferences, ["user note: 山海经"]);
    }
  });

  it("preserves explicit emotion without adding an unrelated metaphor", () => {
    const pack = distillMetaphorPack({ source: "tone notes", sourceType: "user-notes", text: "The tone is calm and curious." });

    assert.deepEqual(pack.coreMetaphors, []);
    assert.deepEqual(pack.archetypes, []);
    assert.deepEqual(pack.emotionalTone, ["calm", "curious"]);
  });

  it("retains matched metaphor suggestions without inventing an emotional tone", () => {
    const pack = distillMetaphorPack({ source: "archive notes", sourceType: "user-notes", text: "An archive organizes knowledge." });

    assert.deepEqual(pack.coreMetaphors.map((item) => item.name), ["library"]);
    assert.ok(pack.archetypes.includes("archivist"));
    assert.ok(pack.namingSystem.includes("library map"));
    assert.deepEqual(pack.emotionalTone, []);
  });
});

describe("slugifyMetaphorSource", () => {
  it("preserves distinct Unicode names and existing English filenames", () => {
    assert.equal(slugifyMetaphorSource("山海经"), "山海经");
    assert.equal(slugifyMetaphorSource("道德经"), "道德经");
    assert.equal(slugifyMetaphorSource("记忆 宫殿 2"), "记忆-宫殿-2");
    assert.equal(slugifyMetaphorSource("Memory Palace"), "memory-palace");
    assert.equal(slugifyMetaphorSource("Cafe\u0301 Notes"), "café-notes");
  });

  it("rejects sources without a usable name", () => {
    for (const source of ["", "  ", "?!", null, undefined]) {
      assert.throws(() => slugifyMetaphorSource(source), /Metaphor source must contain at least one Unicode letter or number/);
    }
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
