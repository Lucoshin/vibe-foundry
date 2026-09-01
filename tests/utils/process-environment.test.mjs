import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSafeProcessEnvironment } from "../../dist/utils/process-environment.js";

const previewPosixHome = ["/", "home", "/", "preview"].join("");
const previewWindowsHome = ["C", ":\\", "Users", "\\", "preview"].join("");

describe("createSafeProcessEnvironment", () => {
  it("copies only the explicit process bootstrap allowlist", () => {
    const environment = createSafeProcessEnvironment({
      Path: "C:\\Tools",
      PATHEXT: ".COM;.EXE;.CMD",
      SystemRoot: "C:\\Windows",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      TEMP: "C:\\Temp",
      TMP: "C:\\Tmp",
      TMPDIR: "/tmp",
      HOME: previewPosixHome,
      USERPROFILE: previewWindowsHome,
      APPDATA: `${previewWindowsHome}\\AppData\\Roaming`,
      LOCALAPPDATA: `${previewWindowsHome}\\AppData\\Local`,
      LANG: "zh_CN.UTF-8",
      LC_ALL: "C.UTF-8",
      LC_CTYPE: "C.UTF-8",
      TZ: "Asia/Shanghai",
      CI: "1",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      CUSTOM_PROJECT_SETTING: "must-not-leak",
      VITE_PRIVATE_TOKEN: "vite-secret",
      NPM_TOKEN: "npm-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
    });

    assert.deepEqual(environment, {
      PATH: "C:\\Tools",
      PATHEXT: ".COM;.EXE;.CMD",
      SYSTEMROOT: "C:\\Windows",
      COMSPEC: "C:\\Windows\\System32\\cmd.exe",
      TEMP: "C:\\Temp",
      TMP: "C:\\Tmp",
      TMPDIR: "/tmp",
      HOME: previewPosixHome,
      USERPROFILE: previewWindowsHome,
      APPDATA: `${previewWindowsHome}\\AppData\\Roaming`,
      LOCALAPPDATA: `${previewWindowsHome}\\AppData\\Local`,
      LANG: "zh_CN.UTF-8",
      LC_ALL: "C.UTF-8",
      LC_CTYPE: "C.UTF-8",
      TZ: "Asia/Shanghai",
      CI: "1",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    });
  });

  it("applies only controlled VibeFoundry overrides without mutating the inputs", () => {
    const hostEnvironment = { PATH: "/usr/bin", BROWSER: "default" };
    const overrides = {
      BROWSER: "none",
      VIBE_FOUNDRY_PREVIEW_BASE: "/component-preview/button/",
    };

    assert.deepEqual(createSafeProcessEnvironment(hostEnvironment, overrides), {
      PATH: "/usr/bin",
      BROWSER: "none",
      VIBE_FOUNDRY_PREVIEW_BASE: "/component-preview/button/",
    });
    assert.deepEqual(hostEnvironment, { PATH: "/usr/bin", BROWSER: "default" });
    assert.deepEqual(overrides, {
      BROWSER: "none",
      VIBE_FOUNDRY_PREVIEW_BASE: "/component-preview/button/",
    });
  });

  it("rejects override names outside the controlled boundary", () => {
    assert.throws(
      () => createSafeProcessEnvironment({}, { VITE_PRIVATE_TOKEN: "secret" }),
      /Unsupported child process environment override: VITE_PRIVATE_TOKEN/,
    );
  });
});
