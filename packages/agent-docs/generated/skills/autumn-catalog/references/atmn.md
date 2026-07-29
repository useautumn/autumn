# atmn catalog flows

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth.

## When to use it

- New project: ask whether to use `atmn` to build and push the catalog. Recommend it for code-managed catalogs.
- Existing project: if `autumn.config.ts` exists, inspect and edit it before pushing.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## Config shapes

`autumn.config.ts` uses the atmn package types, not raw API JSON. Field names are camelCase: `featureId`, `billingMethod`, `billingUnits`, `freeTrial`, `addItems`, `removeItems`, `intervalCount`. Follow the exported types from the package when editing config.

Core builders:

```ts
const messages = feature({
  id: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

const messagesItem = item({
  featureId: messages.id,
  included: 10000,
  reset: { interval: "month" },
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: { amount: 20, interval: "month" },
  items: [messagesItem],
});

export const proAnnual = pro.variant({
  id: "pro_annual",
  name: "Pro Annual",
  customize: {
    price: { amount: 200, interval: "year" },
  },
});
```

Usage-priced item:

```ts
item({
  featureId: messages.id,
  included: 10000,
  price: {
    amount: 0.9,
    billingMethod: "usage_based",
    billingUnits: 1000,
    interval: "month",
  },
});
```

## Headless update loop

1. Inspect or create `autumn.config.ts`.
2. Edit the config to represent the desired catalog.
3. Run `atmn --headless push` to preview changes and required decisions.
4. For each affected plan family, show the user the versioning choice, variant propagation choices/conflicts, and migration draft choice.
5. Rerun `atmn --headless push --yes` with explicit decision flags.
6. Report created/updated/deleted/archived features and plans.

If the user changes the catalog shape or any decision, edit `autumn.config.ts` or the flags and preview again before pushing.

## Decision flags

```sh
atmn --headless push --yes --plan-intents '{"pro":"create_version"}'
atmn --headless push --yes --plan-intents '{"pro":"update_current"}'
atmn --headless push --yes --plan-intents '{"pro":"update_all_versions"}'
atmn --headless push --yes --plan-intents '{"pro":"update_current_and_migrate"}'
atmn --headless push --yes --plan-intents '{"pro":"update_all_versions_and_migrate"}'
atmn --headless push --yes --migration-drafts '{"pro":true}'
atmn --headless push --yes --variant-propagations '{"pro":["pro_annual"]}'
atmn --headless push --yes --variant-propagations '{"pro":[]}'
```

`create_version` grandfathers existing customers. `update_current` edits the current version in place. `update_all_versions` applies the diff to historical versions too. The `*_and_migrate` shortcuts also choose a migration draft for current customers.

Use keys like `pro@v1` when the prompt targets a historical version. For variants, `update_all_versions` is not valid; choose `create_version` or `update_current`.

## What to show the user

- Required plan intents and whether live defaults favor creating a new version.
- Required variant propagation choices and conflicts.
- Required migration choices; drafts do not move customers until run.
- Feature/plan deletions that will archive instead because dependencies or customers exist.
