import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { extractTokens } from "../../dist/analyzers/token-extractor.js";

const fixtureRoots = [];

async function createTokenFixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-tokens-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "src", "components"), { recursive: true });
  await writeFile(
    join(root, "src", "components", "Card.tsx"),
    [
      "export function Card() {",
      "  return <section className=\"bg-white text-slate-950 rounded-lg shadow-sm p-6 text-sm\">Card</section>;",
      "}",
    ].join("\n"),
  );
  await writeFile(
    join(root, "src", "components", "UserPanel.vue"),
    "<template><view class=\"bg-slate-50 rounded-xl p-4 text-lg\">User</view></template>\n",
  );
  return root;
}

describe("extractTokens", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("extracts token categories from Tailwind className strings", async () => {
    const root = await createTokenFixture();

    const tokens = await extractTokens(root, ["src/components"]);

    assert.deepEqual(
      tokens.map((token) => ({
        name: token.name,
        category: token.category,
        occurrences: token.occurrences,
        sourceFiles: token.sourceFiles,
      })),
      [
        {
          name: "bg-slate-50",
          category: "color",
          occurrences: 1,
          sourceFiles: ["src/components/UserPanel.vue"],
        },
        {
          name: "bg-white",
          category: "color",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
        {
          name: "p-4",
          category: "spacing",
          occurrences: 1,
          sourceFiles: ["src/components/UserPanel.vue"],
        },
        {
          name: "p-6",
          category: "spacing",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
        {
          name: "rounded-lg",
          category: "radius",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
        {
          name: "rounded-xl",
          category: "radius",
          occurrences: 1,
          sourceFiles: ["src/components/UserPanel.vue"],
        },
        {
          name: "shadow-sm",
          category: "shadow",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
        {
          name: "text-lg",
          category: "font-size",
          occurrences: 1,
          sourceFiles: ["src/components/UserPanel.vue"],
        },
        {
          name: "text-slate-950",
          category: "color",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
        {
          name: "text-sm",
          category: "font-size",
          occurrences: 1,
          sourceFiles: ["src/components/Card.tsx"],
        },
      ],
    );
  });

  it("extracts scoped CSS, Sass, and Less variables with their real values", async () => {
    const root = await createTokenFixture();
    await mkdir(join(root, "src", "styles"), { recursive: true });
    await writeFile(
      join(root, "src", "styles", "theme.css"),
      `:root { --color-primary: #1677ff; --space-card: 24px; }
       .dark { --color-primary: #69b1ff; }`,
    );
    await writeFile(join(root, "src", "styles", "tokens.scss"), "$radius-card: 12px;\n$font-body: 16px;\n");
    await writeFile(join(root, "src", "styles", "tokens.less"), "@shadow-panel: 0 8px 24px rgba(0,0,0,.12);\n");
    await writeFile(
      join(root, "src", "components", "ThemePanel.vue"),
      `<template><view /></template><style lang="scss" scoped>$color-panel: #ffffff;\n$space-panel: 20rpx;</style>`,
    );

    const tokens = await extractTokens(root, ["src"]);
    const primaryTokens = tokens.filter((token) => token.name === "--color-primary");

    assert.deepEqual(primaryTokens.map((token) => ({
      value: token.value,
      category: token.category,
      syntax: token.syntax,
      scope: token.scope,
    })), [
      { value: "#1677ff", category: "color", syntax: "css-variable", scope: ":root" },
      { value: "#69b1ff", category: "color", syntax: "css-variable", scope: ".dark" },
    ]);
    assert.deepEqual(
      tokens.find((token) => token.name === "$radius-card"),
      {
        name: "$radius-card",
        value: "12px",
        kind: "design-token",
        category: "radius",
        syntax: "sass-variable",
        scope: "module",
        occurrences: 1,
        sourceFiles: ["src/styles/tokens.scss"],
      },
    );
    assert.equal(tokens.find((token) => token.name === "@shadow-panel").category, "shadow");
    assert.deepEqual(
      tokens.find((token) => token.name === "$color-panel"),
      {
        name: "$color-panel",
        value: "#ffffff",
        kind: "design-token",
        category: "color",
        syntax: "sass-variable",
        scope: "component:scoped",
        occurrences: 1,
        sourceFiles: ["src/components/ThemePanel.vue"],
      },
    );
  });
});
