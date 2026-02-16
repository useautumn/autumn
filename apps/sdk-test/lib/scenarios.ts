export type ScenarioStatus = "ready" | "wip" | "planned";

export type ScenarioItem = {
  id: string;
  title: string;
  href: string;
  description: string;
  status: ScenarioStatus;
};

export type ScenarioSection = {
  id: string;
  title: string;
  items: Array<ScenarioItem>;
};

export const scenarioSections: Array<ScenarioSection> = [
  {
    id: "core",
    title: "Core",
    items: [
      {
        id: "use-customer",
        title: "useCustomer",
        href: "/scenarios/core/use-customer",
        description: "Inspect customer fetch state and payloads.",
        status: "ready",
      },
      {
        id: "use-autumn",
        title: "useAutumn",
        href: "/scenarios/core/use-autumn",
        description: "Test generic SDK action helpers.",
        status: "planned",
      },
      {
        id: "use-entity",
        title: "useEntity",
        href: "/scenarios/core/use-entity",
        description: "Inspect entity-level behavior.",
        status: "planned",
      },
      {
        id: "use-pricing-table",
        title: "usePricingTable",
        href: "/scenarios/core/use-pricing-table",
        description: "Inspect pricing table product data.",
        status: "ready",
      },
    ],
  },
  {
    id: "better-auth",
    title: "Better Auth",
    items: [
      {
        id: "better-auth-use-customer",
        title: "useCustomer",
        href: "/scenarios/better-auth/use-customer",
        description: "Validate better-auth plugin routing.",
        status: "planned",
      },
    ],
  },
  {
    id: "convex",
    title: "Convex",
    items: [
      {
        id: "convex-use-customer",
        title: "useCustomer",
        href: "/scenarios/convex/use-customer",
        description: "Validate convex provider integration.",
        status: "planned",
      },
    ],
  },
];

export const findScenarioByHref = ({ href }: { href: string }) => {
  for (const section of scenarioSections) {
    for (const item of section.items) {
      if (item.href === href) {
        return { section, item };
      }
    }
  }

  return null;
};
