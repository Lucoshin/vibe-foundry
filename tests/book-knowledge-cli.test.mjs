import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCli } from "../dist/cli.js";

function capture() {
  const chunks = [];
  return { chunks, stdout: { write: (text) => chunks.push(text) } };
}

describe("book knowledge CLI", () => {
  it("routes preparation and reports that AI reading still remains", async () => {
    const output = capture();
    const calls = [];
    await runCli(["node", "cli", "distill-book", "book.md", "--prepare", "reading"], {
      stdout: output.stdout,
      prepareBookKnowledge: async (...args) => { calls.push(args); return { outputDir: "reading" }; },
      distillBook: async () => { throw new Error("wrong old route"); },
    });
    assert.deepEqual(calls, [["book.md", "reading"]]);
    assert.match(output.chunks.join(""), /AI|阅读/);
  });

  it("routes semantic import with its explicit analysis path", async () => {
    const output = capture();
    const calls = [];
    await runCli(["node", "cli", "distill-book", "book.md", "--analysis", "analysis.json"], {
      stdout: output.stdout,
      importBookKnowledge: async (...args) => { calls.push(args); return { outputDir: "result", asset: { entities: [], relations: [] } }; },
      distillBook: async () => { throw new Error("wrong old route"); },
    });
    assert.deepEqual(calls, [["book.md", "analysis.json"]]);
    assert.match(output.chunks.join(""), /result/);
  });

  it("rejects missing, duplicated, conflicting and unknown book options before any work", async () => {
    for (const args of [["--prepare"], ["--analysis"], ["--prepare", "x", "--analysis", "y"], ["--prepare", "x", "--prepare", "y"], ["--unknown", "x"], ["extra"]]) {
      await assert.rejects(() => runCli(["node", "cli", "distill-book", "book.md", ...args], {
        distillBook: async () => { throw new Error("should not run"); },
      }), /参数|选项/);
    }
  });

  it("retains the explicitly labelled basic statistics command", async () => {
    const output = capture();
    await runCli(["node", "cli", "distill-book", "book.md"], {
      stdout: output.stdout, distillBook: async () => ({ outputDir: "stats" }),
    });
    assert.match(output.chunks.join(""), /词表|统计/);
  });
});
