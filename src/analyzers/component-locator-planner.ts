const locatorProps = [
  ["data-testid", "test-id"],
  ["id", "id"],
  ["role", "aria-role"],
  ["aria-label", "aria-label"],
];

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function evidence(kind, value, sourceLocation) {
  return { kind, value, sourceLocation };
}

export function planComponentLocatorEvidence(component) {
  return (component.scenarios ?? []).map((scenario) => {
    const items = [];
    for (const [propName, kind] of locatorProps) {
      const value = stringValue(scenario.props?.[propName]);
      if (value) items.push(evidence(kind, value, scenario.sourceLocation));
    }
    const text = stringValue(scenario.slots?.default);
    if (text) items.push(evidence("text", text, scenario.sourceLocation));
    const classValue = stringValue(
      scenario.props?.className ?? scenario.props?.class,
    );
    if (classValue) items.push(evidence("class", classValue, scenario.sourceLocation));
    return {
      scenarioId: scenario.id,
      sourceFile: scenario.sourceFile,
      evidence: items,
      ...(items.length === 0 ? { unresolvedReason: "no-stable-locator" } : {}),
    };
  });
}
