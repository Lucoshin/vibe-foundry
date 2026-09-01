import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectBusinessDomain,
  detectBusinessEntrypoints,
} from "../../dist/analyzers/business-entrypoint-detector.js";

describe("business entrypoint detector", () => {
  it("detects auth entrypoints from paths and source text", () => {
    const result = detectBusinessEntrypoints(
      "src/app/api/auth/register/route.ts",
      "export async function POST() { await createSession(); }",
    );

    assert.deepEqual(result, ["register", "session"]);
    assert.equal(
      detectBusinessDomain("src/app/api/auth/register/route.ts", result),
      "auth",
    );
  });

  it("detects billing and permission domains", () => {
    const billing = detectBusinessEntrypoints(
      "src/server/billing/subscription.ts",
      "export async function createSubscription() {}",
    );
    const permission = detectBusinessEntrypoints(
      "src/services/permission/role.ts",
      "export function checkRole() {}",
    );

    assert.deepEqual(billing, ["subscription"]);
    assert.equal(
      detectBusinessDomain("src/server/billing/subscription.ts", billing),
      "billing",
    );
    assert.deepEqual(permission, ["permission", "role"]);
    assert.equal(
      detectBusinessDomain("src/services/permission/role.ts", permission),
      "permission",
    );
  });
});
