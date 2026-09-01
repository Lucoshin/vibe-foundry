import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeBusinessPatterns } from "../../dist/analyzers/business-pattern-summarizer.js";

describe("summarizeBusinessPatterns", () => {
  it("summarizes auth business flows from service assets", () => {
    const patterns = summarizeBusinessPatterns([
      {
        name: "auth.register",
        kind: "service",
        businessDomain: "auth",
        entrypoints: ["register", "session"],
        filePath: "src/app/api/auth/register/route.ts",
      },
      {
        name: "auth.login",
        kind: "service",
        businessDomain: "auth",
        entrypoints: ["login", "session"],
        filePath: "src/app/api/auth/login/route.ts",
      },
    ]);

    assert.deepEqual(patterns, [
      {
        name: "auth flow",
        kind: "business-pattern",
        businessDomain: "auth",
        entrypoints: ["login", "register", "session"],
        sourceFiles: [
          "src/app/api/auth/login/route.ts",
          "src/app/api/auth/register/route.ts",
        ],
        guidance: [
          "Preserve credential validation and session handling constraints.",
          "Check rate limiting, password policy, and account enumeration risk before reuse.",
        ],
      },
    ]);
  });
});
