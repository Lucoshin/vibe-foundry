import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("VibeFoundry Pencil web design board", () => {
  it("contains the required web asset browser screens and Apple-style tokens", async () => {
    const document = JSON.parse(await readFile("VibeFoundry.pen", "utf8"));
    const frames = document.children.filter((node) => node.type === "frame");
    const names = frames.map((frame) => frame.name);
    const serialized = JSON.stringify(document);

    assert.deepEqual(names, [
      "Overview",
      "Asset Library",
      "Reports",
      "Missing Package",
    ]);
    assert.equal(frames.length, 4);
    assert.ok(frames.every((frame) => frame.width === 1280 && frame.height === 860));
    assert.match(serialized, /VibeFoundry/);
    assert.match(serialized, /Asset Library/);
    assert.match(serialized, /#f5f5f7/);
    assert.match(serialized, /#0071e3/);
  });
});
