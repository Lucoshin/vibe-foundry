import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import * as assetLibrary from "../../dist/library/asset-library.js";

const { assetPackageDirectoryFor, registerAssetPackage } = assetLibrary;

const roots = [];
const originalLibraryRoot = process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

async function createLibraryRoot() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-library-"));
  roots.push(root);
  return root;
}

describe("asset library", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    if (originalLibraryRoot === undefined) {
      delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;
    } else {
      process.env.VIBE_FOUNDRY_LIBRARY_ROOT = originalLibraryRoot;
    }
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
  });

  it("resolves an explicit root before the environment and user-home default", () => {
    assert.equal(typeof assetLibrary.resolveAssetLibraryRoot, "function");
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = join(tmpdir(), "environment-library");

    assert.equal(
      assetLibrary.resolveAssetLibraryRoot(join(tmpdir(), "explicit-library")),
      resolve(tmpdir(), "explicit-library"),
    );
  });

  it("resolves the environment root before the user-home default", () => {
    assert.equal(typeof assetLibrary.resolveAssetLibraryRoot, "function");
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = join(tmpdir(), "environment-library");

    assert.equal(
      assetLibrary.resolveAssetLibraryRoot(),
      resolve(tmpdir(), "environment-library"),
    );
  });

  it("defaults to the current user's cross-platform library directory", () => {
    assert.equal(typeof assetLibrary.resolveAssetLibraryRoot, "function");
    delete process.env.VIBE_FOUNDRY_LIBRARY_ROOT;

    assert.equal(
      assetLibrary.resolveAssetLibraryRoot(),
      join(homedir(), ".vibe-foundry", "library"),
    );
  });

  it("rejects an explicitly empty asset library root", () => {
    assert.throws(
      () => assetLibrary.resolveAssetLibraryRoot(""),
      /Asset library root must be a non-empty path\./,
    );
  });

  it("treats a whitespace-only environment root as unset", () => {
    process.env.VIBE_FOUNDRY_LIBRARY_ROOT = "  \t  ";

    assert.equal(
      assetLibrary.resolveAssetLibraryRoot(),
      join(homedir(), ".vibe-foundry", "library"),
    );
  });

  it("keeps case-distinct project roots separate on case-sensitive platforms", () => {
    Object.defineProperty(process, "platform", { ...originalPlatformDescriptor, value: "linux" });
    const libraryRoot = join(tmpdir(), "case-sensitive-library");

    assert.notEqual(
      assetPackageDirectoryFor(libraryRoot, "C:/Projects/Example"),
      assetPackageDirectoryFor(libraryRoot, "C:/Projects/example"),
    );
  });

  it("deduplicates case variants by stable project identity on Windows", async () => {
    Object.defineProperty(process, "platform", { ...originalPlatformDescriptor, value: "win32" });
    const libraryRoot = await createLibraryRoot();
    const firstSource = "C:/Projects/Example";
    const secondSource = "c:/projects/example";

    await registerAssetPackage(libraryRoot, {
      projectRoot: firstSource,
      sourceProject: "example",
      assetPackageDir: assetPackageDirectoryFor(libraryRoot, firstSource),
      generatedAt: "2026-09-01T00:00:00.000Z",
    });
    await registerAssetPackage(libraryRoot, {
      projectRoot: secondSource,
      sourceProject: "example",
      assetPackageDir: assetPackageDirectoryFor(libraryRoot, secondSource),
      generatedAt: "2026-09-01T01:00:00.000Z",
    });

    const index = JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));
    assert.equal(index.projects.length, 1);
    assert.equal(index.projects[0].generatedAt, "2026-09-01T01:00:00.000Z");
  });

  it("keeps asset packages separate and updates an existing source project entry", async () => {
    const libraryRoot = await createLibraryRoot();
    const firstSource = "C:/Projects/first-app";
    const secondSource = "C:/Projects/second-app";
    const firstPackage = assetPackageDirectoryFor(libraryRoot, firstSource);
    const secondPackage = assetPackageDirectoryFor(libraryRoot, secondSource);

    assert.notEqual(firstPackage, secondPackage);

    await registerAssetPackage(libraryRoot, {
      projectRoot: firstSource,
      sourceProject: "first-app",
      assetPackageDir: firstPackage,
      generatedAt: "2026-07-11T00:00:00.000Z",
    });
    await registerAssetPackage(libraryRoot, {
      projectRoot: secondSource,
      sourceProject: "second-app",
      assetPackageDir: secondPackage,
      generatedAt: "2026-07-11T00:00:00.000Z",
    });
    await registerAssetPackage(libraryRoot, {
      projectRoot: firstSource,
      sourceProject: "first-app",
      assetPackageDir: firstPackage,
      generatedAt: "2026-07-11T01:00:00.000Z",
    });

    const index = JSON.parse(await readFile(join(libraryRoot, "index.json"), "utf8"));
    assert.equal(index.projects.length, 2);
    assert.equal(index.projects[0].generatedAt, "2026-07-11T01:00:00.000Z");
    assert.equal(index.projects[1].projectRoot, resolve(secondSource));
    assert.equal(index.projects[0].assetPackageDir, resolve(firstPackage));
  });
});
