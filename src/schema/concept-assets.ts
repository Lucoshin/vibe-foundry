export const supportedProductPatternTypes = [
  "onboarding",
  "pricing",
  "dashboard",
  "settings",
  "invite",
  "content-creation",
  "empty-state",
  "upgrade-prompt",
  "user-activation",
];

const productPatternGuidance = {
  onboarding: {
    name: "onboarding product pattern",
    useCases: ["new user activation", "first-run guidance"],
    applicableScenarios: ["SaaS setup flows", "account activation", "team workspace creation"],
    guidance: [
      "Guide users toward one meaningful first action.",
      "Keep setup steps visible and resumable.",
    ],
    limitations: [
      "Validate against real activation metrics before treating the pattern as reusable.",
    ],
  },
  pricing: {
    name: "pricing product pattern",
    useCases: ["plan comparison", "conversion"],
    applicableScenarios: ["pricing pages", "upgrade flows", "subscription products"],
    guidance: [
      "Make plan differences scannable.",
      "Tie upgrade prompts to clear product value.",
    ],
    limitations: [
      "Pricing copy and claims require business review before reuse.",
    ],
  },
  dashboard: {
    name: "dashboard product pattern",
    useCases: ["status overview", "repeat usage"],
    applicableScenarios: ["admin tools", "analytics products", "team workspaces"],
    guidance: [
      "Prioritize current state, next action, and recent change.",
      "Keep dense information grouped by user intent.",
    ],
    limitations: [
      "Dashboard layout should follow the target user's daily operating rhythm.",
    ],
  },
  settings: {
    name: "settings product pattern",
    useCases: ["configuration", "account management"],
    applicableScenarios: ["profile settings", "workspace controls", "admin preferences"],
    guidance: [
      "Group settings by ownership and risk.",
      "Make destructive or security-sensitive changes explicit.",
    ],
    limitations: [
      "Settings taxonomy depends on permission and role model details.",
    ],
  },
  invite: {
    name: "invite product pattern",
    useCases: ["team growth", "collaboration activation"],
    applicableScenarios: ["team products", "referral flows", "workspace onboarding"],
    guidance: [
      "Explain why inviting others improves the current workflow.",
      "Keep invitation state and follow-up actions visible.",
    ],
    limitations: [
      "Invitation flows must respect privacy, consent, and spam constraints.",
    ],
  },
  "content-creation": {
    name: "content creation product pattern",
    useCases: ["creation workflow", "draft production"],
    applicableScenarios: ["editors", "publishing tools", "AI generation tools"],
    guidance: [
      "Preserve draft state and make the next editing action obvious.",
      "Separate creation, review, and publishing states.",
    ],
    limitations: [
      "Creation workflows should be adapted to the medium and review process.",
    ],
  },
  "empty-state": {
    name: "empty state product pattern",
    useCases: ["first action", "activation"],
    applicableScenarios: ["empty dashboards", "new accounts", "new projects"],
    guidance: [
      "State what is missing and offer one primary next action.",
      "Use the empty state to teach the product's core loop.",
    ],
    limitations: [
      "Avoid decorative empty states that do not help users move forward.",
    ],
  },
  "upgrade-prompt": {
    name: "upgrade prompt product pattern",
    useCases: ["monetization", "feature gating"],
    applicableScenarios: ["freemium products", "usage limits", "premium features"],
    guidance: [
      "Connect the prompt to the blocked user goal.",
      "Explain the unlocked value before asking for payment.",
    ],
    limitations: [
      "Upgrade prompts must not block critical non-paid workflows unexpectedly.",
    ],
  },
  "user-activation": {
    name: "user activation product pattern",
    useCases: ["activation", "retention"],
    applicableScenarios: ["onboarding", "first project setup", "trial conversion"],
    guidance: [
      "Identify the smallest action that produces product value.",
      "Reduce friction before the activation moment.",
    ],
    limitations: [
      "Activation assumptions must be tested against actual user behavior.",
    ],
  },
};

export function createConceptAsset(options) {
  const pattern = productPatternGuidance[options.patternType];
  if (!pattern) {
    throw new Error(`Unsupported product pattern type: ${options.patternType}`);
  }

  return {
    kind: "concept",
    name: pattern.name,
    patternType: options.patternType,
    sourceFiles: options.sourceFiles,
    useCases: pattern.useCases,
    applicableScenarios: pattern.applicableScenarios,
    guidance: pattern.guidance,
    limitations: pattern.limitations,
    confidence: "heuristic",
  };
}
