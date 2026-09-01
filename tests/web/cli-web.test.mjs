import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("CLI web command", () => {
  it("prints usage with distill and web commands for unknown input", async () => {
    const { runCli } = await import("../../dist/cli.js");
    const messages = [];

    const result = await runCli(["node", "cli.js", "unknown"], {
      stderr: { write: (message) => messages.push(message) },
    });

    assert.equal(result.exitCode, 1);
    assert.match(messages.join(""), /vibe-foundry distill <project-root>/);
    assert.match(messages.join(""), /vibe-foundry distill-book <book-path>/);
    assert.match(messages.join(""), /vibe-foundry web <project-root> \[--port <port>\]/);
    assert.doesNotMatch(messages.join(""), /--preview-port/);
    assert.doesNotMatch(messages.join(""), /vibe-foundry preview <project-root>/);
  });

  it("distills a book from the distill-book command", async () => {
    const { runCli } = await import("../../dist/cli.js");
    const messages = [];
    const calls = [];

    const result = await runCli(
      ["node", "cli.js", "distill-book", "books/geb.pdf"],
      {
        stdout: { write: (message) => messages.push(message) },
        distillBook: async (bookPath) => {
          calls.push(bookPath);
          return { outputDir: "library/books/geb" };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, ["books/geb.pdf"]);
    assert.match(messages.join(""), /library\/books\/geb/);
  });

  it("starts the web server from the web command", async () => {
    const { runCli } = await import("../../dist/cli.js");
    const messages = [];
    const calls = [];

    const result = await runCli(
      ["node", "cli.js", "web", "examples/fixture-project", "--port", "4555"],
      {
        stdout: { write: (message) => messages.push(message) },
        startWebServer: async (projectRoot, options) => {
          calls.push({ projectRoot, options });
          return { url: "http://127.0.0.1:4555/" };
        },
      },
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(calls, [
      {
        projectRoot: "examples/fixture-project",
        options: { port: 4555 },
      },
    ]);
    assert.match(messages.join(""), /http:\/\/127\.0\.0\.1:4555\//);
  });

  it("keeps component previews inside the web command surface", async () => {
    const { runCli } = await import("../../dist/cli.js");
    const messages = [];

    const result = await runCli(
      ["node", "cli.js", "web", "examples/fixture-project", "--port", "4555"],
      {
        stdout: { write: (message) => messages.push(message) },
        stderr: { write: () => {} },
        startWebServer: async () => ({ url: "http://127.0.0.1:4555/" }),
      },
    );

    assert.equal(result.exitCode, 0);
    assert.match(messages.join(""), /http:\/\/127\.0\.0\.1:4555\//);
    assert.doesNotMatch(messages.join(""), /5173/);
  });

  it("rejects the removed preview command without invoking extra services", async () => {
    const { runCli } = await import("../../dist/cli.js");
    const messages = [];

    const result = await runCli(
      [
        "node",
        "cli.js",
        "preview",
        "examples/fixture-project",
        "--component",
        "Button",
        "--port",
        "5174",
      ],
      {
        stdout: { write: (message) => messages.push(message) },
        stderr: { write: (message) => messages.push(message) },
      },
    );

    assert.equal(result.exitCode, 1);
    assert.doesNotMatch(messages.join(""), /5174/);
    assert.doesNotMatch(messages.join(""), /vibe-foundry preview <project-root>/);
  });
});
