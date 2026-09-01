import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { analyzeComponents } from "../../dist/analyzers/component-analyzer.js";

const fixtureRoots = [];

async function createComponentFixture() {
  const root = await mkdtemp(join(tmpdir(), "vibe-foundry-components-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "src", "components"), { recursive: true });
  await mkdir(join(root, "src", "pages"), { recursive: true });
  await writeFile(
    join(root, "src", "components", "Button.tsx"),
    "export function Button({ children }) { return <button>{children}</button>; }\n",
  );
  await writeFile(
    join(root, "src", "components", "BillingSummary.tsx"),
    "import { getInvoice } from '../lib/billing';\nexport function BillingSummary() { return <section />; }\n",
  );
  await writeFile(
    join(root, "src", "components", "JobCard.js"),
    "const JobCard = () => <article />;\nexport default JobCard;\n",
  );
  await writeFile(
    join(root, "src", "components", "UserPanel.vue"),
    "<template><view class=\"user-panel\">User</view></template>\n<script setup lang=\"ts\">defineEmits(['select'])</script>\n",
  );
  await writeFile(
    join(root, "src", "pages", "Dashboard.tsx"),
    "import { Button } from '../components/Button';\nexport default () => <Button label=\"提交申请\" count={3} disabled tags={[\"日结\", \"包餐\"]} onClick={() => {}} />;\n",
  );
  await writeFile(
    join(root, "src", "pages", "Members.vue"),
    "<script setup>import UserPanel from '../components/UserPanel.vue'</script>\n<template><UserPanel title=\"成员列表\" :count=\"2\" :user=\"selectedUser\" v-if=\"open\" active @select=\"openUser\"><image src=\"/nested.png\" /></UserPanel></template>\n",
  );
  await writeFile(
    join(root, "src", "pages", "UserPanel.test.js"),
    "const fake = '<UserPanel title=\"测试伪场景\" />';\n",
  );
  await writeFile(
    join(root, "src", "components", "filterDrawerUtils.js"),
    "export const countActiveFilters = () => 0;\n",
  );
  await writeFile(
    join(root, "src", "components", "Button.test.tsx"),
    "import { Button } from './Button';\ntest('renders', () => Button({ children: 'Save' }));\n",
  );
  await writeFile(
    join(root, "src", "components", "JobCard.test.js"),
    "import JobCard from './JobCard';\ntest('renders', () => JobCard({}));\n",
  );
  await writeFile(
    join(root, "src", "components", "BillingSummary.spec.jsx"),
    "import { BillingSummary } from './BillingSummary';\ntest('renders', () => BillingSummary());\n",
  );
  return root;
}

describe("analyzeComponents", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("uses literal props and events from real component call sites", async () => {
    const root = await createComponentFixture();

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const button = components.find((component) => component.name === "Button");
    const userPanel = components.find((component) => component.name === "UserPanel");

    assert.deepEqual(button.previewScenario, {
      source: "usage",
      sourceFile: "src/pages/Dashboard.tsx",
      props: {
        label: "提交申请",
        count: 3,
        disabled: true,
        tags: ["日结", "包餐"],
      },
      events: ["onClick"],
    });
    assert.deepEqual(userPanel.previewScenario, {
      source: "usage",
      sourceFile: "src/pages/Members.vue",
      props: { title: "成员列表", count: 2, active: true },
      events: ["select"],
      unresolvedProps: ["user"],
      unresolvedSlots: ["default"],
    });
  });

  it("prefers source-authored stories without treating story files as components", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "Button.stories.tsx"),
      "import { Button } from './Button';\nexport const Primary = () => <Button label=\"Story 主按钮\" count={7} />;\n",
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/components", "src/pages"]);
    const button = components.find((component) => component.name === "Button");

    assert.equal(components.some((component) => component.filePath.includes(".stories.")), false);
    assert.equal(button.previewScenario.sourceFile, "src/components/Button.stories.tsx");
    assert.deepEqual(button.previewScenario.props, { label: "Story 主按钮", count: 7 });
  });

  it("records spread-only usage as unresolved instead of inventing a boolean prop", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "HeroMobile.js"),
      "const HeroMobile = ({ title }) => <section>{title}</section>; export default HeroMobile;\n",
    );
    await writeFile(
      join(root, "src", "pages", "Hero.js"),
      "import HeroMobile from '../components/HeroMobile'; export default (props) => <HeroMobile {...props} />;\n",
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const hero = components.find((component) => component.name === "HeroMobile");

    assert.deepEqual(hero.previewScenario.props, {});
    assert.deepEqual(hero.previewScenario.unresolvedProps, ["spread:props"]);
    assert.equal("props" in hero.previewScenario.props, false);
  });

  it("keeps dynamic JSX props unresolved without leaking callback expressions into props", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "AgreementOverlay.js"),
      "export default function AgreementOverlay() { return <div />; }\n",
    );
    await writeFile(
      join(root, "src", "pages", "Apply.js"),
      `import AgreementOverlay from '../components/AgreementOverlay';
       export default () => <AgreementOverlay
         visible={showAgreement}
         onClose={() => { setShowAgreement(false); }}
         content={overlayContent}
         title="用户协议"
       />;\n`,
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const overlay = components.find((component) => component.name === "AgreementOverlay");

    assert.deepEqual(overlay.previewScenario.props, { title: "用户协议" });
    assert.deepEqual(overlay.previewScenario.events, ["onClose"]);
    assert.deepEqual(overlay.previewScenario.unresolvedProps, ["content", "visible"]);
    assert.equal("setShowAgreement" in overlay.previewScenario.props, false);
    assert.equal(overlay.scenarios.length, 1);
    assert.equal(overlay.primaryScenarioId, overlay.scenarios[0].id);
    assert.equal(overlay.scenarios[0].evidence.importResolved, true);
  });

  it("does not parse words inside Vue event expressions as component props", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "BasicButton.vue"),
      "<template><button><slot /></button></template>\n",
    );
    await writeFile(
      join(root, "src", "pages", "About.vue"),
      `<script setup>import BasicButton from '../components/BasicButton.vue'</script>
       <template><BasicButton @click="jump('/pages/log/index?id=1&title=log')">登录</BasicButton></template>`,
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const button = components.find((component) => component.name === "BasicButton");

    assert.deepEqual(button.previewScenario.props, {});
    assert.deepEqual(button.previewScenario.events, ["click"]);
    assert.deepEqual(button.previewScenario.slots, { default: "登录" });
    assert.deepEqual(button.scenarios[0].slots, { default: "登录" });
    assert.equal("pages" in button.previewScenario.props, false);
    assert.equal("title" in button.previewScenario.props, false);
  });

  it("matches kebab-case Vue template tags to PascalCase imports", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "pages", "KebabUsage.vue"),
      "<script setup>import UserPanel from '../components/UserPanel.vue'</script>\n<template><user-panel title=\"短横线调用\" /></template>\n",
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const panel = components.find((component) => component.name === "UserPanel");

    assert.ok(panel.scenarios.some((scenario) => scenario.props.title === "短横线调用"));
  });

  it("keeps React component identifiers case-sensitive", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "pages", "CaseSensitive.tsx"),
      "import UserPanel from '../components/UserPanel.vue';\nconst Userpanel = () => <div />;\nexport default () => <Userpanel title=\"本地组件\" />;\n",
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const panel = components.find((component) => component.name === "UserPanel");

    assert.equal(panel.scenarios.some((scenario) => scenario.props.title === "本地组件"), false);
  });

  it("marks nested component children as an unresolved default slot", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "ProtectedRoute.js"),
      "export default function ProtectedRoute({ children }) { return children; }\n",
    );
    await writeFile(
      join(root, "src", "pages", "Route.js"),
      "import ProtectedRoute from '../components/ProtectedRoute'; const Dashboard = () => <main />; export default () => <ProtectedRoute><Dashboard /></ProtectedRoute>;\n",
    );

    const components = await analyzeComponents(root, ["src/components"], ["src/pages"]);
    const route = components.find((component) => component.name === "ProtectedRoute");

    assert.deepEqual(route.previewScenario.unresolvedSlots, ["default"]);
  });

  it("marks Vue components that require the uni-app H5 host runtime", async () => {
    const root = await createComponentFixture();
    await writeFile(
      join(root, "src", "components", "TimeRangePicker.vue"),
      `<template><picker-view><picker-view-column><view>08:30</view></picker-view-column></picker-view></template>`,
    );

    const components = await analyzeComponents(root, ["src/components"]);
    const picker = components.find((component) => component.name === "TimeRangePicker");

    assert.equal(picker.platformRuntime, "uni-h5");
    assert.deepEqual(picker.platformComponents, ["picker-view", "picker-view-column", "view"]);
    assert.match(picker.sourceFingerprint, /^[a-f0-9]{64}$/);
  });

  it("changes the dependency fingerprint when a transitive local import changes", async () => {
    const root = await createComponentFixture();
    await mkdir(join(root, "src", "lib"), { recursive: true });
    await writeFile(
      join(root, "src", "components", "Button.tsx"),
      "import { label } from '../lib/label'; export function Button() { return <button>{label}</button>; }\n",
    );
    await writeFile(join(root, "src", "lib", "label.ts"), "export const label = 'Save';\n");

    const first = await analyzeComponents(root, ["src/components"], ["src"]);
    await writeFile(join(root, "src", "lib", "label.ts"), "export const label = 'Submit';\n");
    const second = await analyzeComponents(root, ["src/components"], ["src"]);
    const firstButton = first.find((component) => component.name === "Button");
    const secondButton = second.find((component) => component.name === "Button");

    assert.match(firstButton.dependencyFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(firstButton.sourceFingerprint, secondButton.sourceFingerprint);
    assert.notEqual(firstButton.dependencyFingerprint, secondButton.dependencyFingerprint);
  });

  it("links a real component usage to a statically proven public route and locator", async () => {
    const root = await createComponentFixture();
    await mkdir(join(root, "src", "app", "public-components"), { recursive: true });
    await writeFile(
      join(root, "src", "app", "public-components", "page.tsx"),
      `import { Button } from '../../components/Button';
       export default function PublicComponents() {
         return <Button data-testid="public-primary" aria-label="保存">保存修改</Button>;
       }`,
    );

    const components = await analyzeComponents(root, ["src/components"], ["src"]);
    const button = components.find((component) => component.name === "Button");
    const capture = button.sourceCaptureCandidates.find(
      (candidate) => candidate.route === "/public-components",
    );

    assert.equal(capture.usageSource, "src/app/public-components/page.tsx");
    assert.equal(capture.routeEvidence, "next-app-page");
    assert.deepEqual(capture.locatorEvidence.map((item) => [item.kind, item.value]), [
      ["test-id", "public-primary"],
      ["aria-label", "保存"],
      ["text", "保存修改"],
    ]);
  });

  it("extracts component candidates from configured component directories", async () => {
    const root = await createComponentFixture();

    const components = await analyzeComponents(root, ["src/components"]);

    assert.deepEqual(
      components.map((component) => ({
        name: component.name,
        filePath: component.filePath,
        kind: component.kind,
        exportMode: component.exportMode,
        exportName: component.exportName,
        reusePotential: component.reusePotential,
      })),
      [
        {
          name: "BillingSummary",
          filePath: "src/components/BillingSummary.tsx",
          kind: "component",
          exportMode: "named",
          exportName: "BillingSummary",
          reusePotential: "medium",
        },
        {
          name: "Button",
          filePath: "src/components/Button.tsx",
          kind: "component",
          exportMode: "named",
          exportName: "Button",
          reusePotential: "high",
        },
        {
          name: "JobCard",
          filePath: "src/components/JobCard.js",
          kind: "component",
          exportMode: "default",
          exportName: "default",
          reusePotential: "high",
        },
        {
          name: "UserPanel",
          filePath: "src/components/UserPanel.vue",
          kind: "component",
          exportMode: "default",
          exportName: "default",
          reusePotential: "high",
        },
      ],
    );
  });
});
