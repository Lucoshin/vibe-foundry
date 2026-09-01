const guidanceByDomain = {
  auth: [
    "Preserve credential validation and session handling constraints.",
    "Check rate limiting, password policy, and account enumeration risk before reuse.",
  ],
  billing: [
    "Preserve payment provider webhook and subscription state constraints.",
    "Check idempotency, invoice state, and refund edge cases before reuse.",
  ],
  permission: [
    "Preserve role and permission boundaries.",
    "Check privilege escalation paths before reuse.",
  ],
};

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function summarizeBusinessPatterns(services) {
  const byDomain = new Map();

  for (const service of services) {
    const domain = service.businessDomain ?? "general";
    const existing = byDomain.get(domain) ?? {
      services: [],
      entrypoints: [],
      sourceFiles: [],
    };
    existing.services.push(service);
    existing.entrypoints.push(...(service.entrypoints ?? []));
    existing.sourceFiles.push(service.filePath);
    byDomain.set(domain, existing);
  }

  return [...byDomain.entries()]
    .map(([businessDomain, value]) => ({
      name: `${businessDomain} flow`,
      kind: "business-pattern",
      businessDomain,
      entrypoints: uniqueSorted(value.entrypoints),
      sourceFiles: uniqueSorted(value.sourceFiles),
      guidance:
        guidanceByDomain[businessDomain] ??
        ["Preserve source constraints and validate edge cases before reuse."],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
