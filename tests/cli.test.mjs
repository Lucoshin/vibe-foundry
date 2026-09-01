import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("public API", () => {
  it("exports a distill command handler", async () => {
    const mod = await import("../dist/index.js");

    assert.equal(typeof mod.distillProject, "function");
  });
  it("exports a web command handler", async () => {
    const mod = await import("../dist/web/server.js");

    assert.equal(typeof mod.startWebServer, "function");
  });
});
