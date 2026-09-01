import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePagePatterns } from "../../dist/analyzers/page-pattern-summarizer.js";

describe("summarizePagePatterns", () => {
  it("summarizes common page patterns from page directories", () => {
    const patterns = summarizePagePatterns([
      "src/app/login/page.tsx",
      "src/app/dashboard/page.tsx",
      "src/app/settings/page.tsx",
    ]);

    assert.deepEqual(patterns, [
      {
        name: "login page",
        kind: "page-pattern",
        pageType: "login",
        sourceFiles: ["src/app/login/page.tsx"],
      },
      {
        name: "dashboard page",
        kind: "page-pattern",
        pageType: "dashboard",
        sourceFiles: ["src/app/dashboard/page.tsx"],
      },
      {
        name: "settings page",
        kind: "page-pattern",
        pageType: "settings",
        sourceFiles: ["src/app/settings/page.tsx"],
      },
    ]);
  });

  it("extracts structural regions from React and Vue page templates", () => {
    const patterns = summarizePagePatterns([
      {
        filePath: "src/pages/jobs/index.tsx",
        sourceText: `export default function Jobs() { return <><header><SearchBar /></header><FilterDrawer /><main><JobList /></main><EmptyState /><footer><SubmitButton /></footer></>; }`,
      },
      {
        filePath: "src/pages/profile.vue",
        sourceText: `<template><nav /><ProfileForm /><BottomActionBar /></template>`,
      },
    ]);

    assert.deepEqual(patterns[0].regions, [
      "navigation",
      "search",
      "filter",
      "list",
      "empty-state",
      "overlay",
      "bottom-action",
    ]);
    assert.deepEqual(patterns[1].regions, ["navigation", "form", "bottom-action"]);
  });
});
