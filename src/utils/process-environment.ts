const inheritedEnvironmentNames = [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
];

const controlledOverrideNames = new Set([
  "BROWSER",
  "VIBE_FOUNDRY_PREVIEW_BASE",
]);

export function createSafeProcessEnvironment(hostEnvironment = process.env, overrides = {}) {
  const hostByCanonicalName = new Map(
    Object.entries(hostEnvironment ?? {}).map(([name, value]) => [name.toUpperCase(), value]),
  );
  const environment = {};

  for (const name of inheritedEnvironmentNames) {
    const value = hostByCanonicalName.get(name);
    if (typeof value === "string") environment[name] = value;
  }

  for (const [name, value] of Object.entries(overrides ?? {})) {
    const canonicalName = name.toUpperCase();
    if (!controlledOverrideNames.has(canonicalName)) {
      throw new TypeError(`Unsupported child process environment override: ${name}`);
    }
    if (typeof value === "string") environment[canonicalName] = value;
  }

  return environment;
}
