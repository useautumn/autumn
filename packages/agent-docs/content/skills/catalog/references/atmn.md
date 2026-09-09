# atmn catalog flows

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth. This reference describes atmn v3 (`atmn-nightly`): a config is the whole desired catalog, and every push is a preview first.

## When to use it

- New project: run `atmn init`. It logs in, places the config (its own package in a monorepo), pulls whatever the sandbox already holds, and installs these skills beside the config.
- Existing project: if `autumn.config.ts` exists, edit it and push. `atmn pull` writes the server's catalog back into it in place.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## Commands

| Command | What it does |
| --- | --- |
| `atmn init [--path <dir>] [--name <name>] [--login]` | Set up the repo. In a monorepo it asks where the package goes; headless, it prints the flag to pass and stops. |
| `atmn push` | Preview the config against the sandbox. Nothing is applied. |
| `atmn push --yes` | Apply exactly what the preview showed. |
| `atmn pull` | Write the server's catalog into the config, editing fixtures in place. |
| `atmn env [--json]` | Which org, environment and key the commands target. |
| `atmn sandbox list` / `use <name\|id>` / `use --clear` / `create <name>` / `delete <id>` | Named sandboxes. `use` pins one so every later command targets it. |
| `atmn reset --yes` | Wipe the targeted sandbox's catalog and customers. |
| `atmn skills [<name>] [--ref <path>]` | Print the skills this CLI carries. |
| `atmn skills install` / `update` | Write the skills next to the config; bring an older copy up to date. |

Global flags: `--headless` never prompts (the default without a TTY), `-c <file|dir>` names the config, `--sandbox <id>` targets a sandbox for one command, `-p` targets production.

Every command finds the config from the repo root through the `"atmn"` field `atmn init` writes into the root `package.json`, so `atmn push` works from anywhere in the repo.

## Config shapes

`autumn.config.ts` exports one `atmn({ ... })` document. Field names are camelCase and mirror the API's `catalogV2.update` body: `featureId`, `planId`, `billingMethod`, `billingUnits`, `freeTrial`, `intervalCount`, `versionSlug`. The builders are typed identity functions: `feature`, `plan`, `variant`, `license`, `coupon`, `featureGrant`, `referralProgram`. Follow the exported types when editing.

```ts
import { atmn, feature, plan } from "atmn-nightly";

const messages = feature({
  featureId: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

export default atmn({
  features: [messages],
  plans: [
    plan({
      planId: "pro",
      name: "Pro",
      price: { amount: 20, interval: "month" },
      items: [
        {
          featureId: messages.featureId,
          included: 10000,
          reset: { interval: "month" },
        },
      ],
    }),
  ],
});
```

Usage-priced item (pay for use beyond the allowance):

```ts
{
  featureId: messages.featureId,
  included: 10000,
  reset: { interval: "month" },
  price: {
    amount: 0.9,
    billingUnits: 1000,
    billingMethod: "usage_based",
    interval: "month",
  },
}
```

Variants live inside their base plan's `variants` array. Each names the variant plan and states its overlay under `customize`:

```ts
plan({
  planId: "pro",
  name: "Pro",
  price: { amount: 20, interval: "month" },
  variants: [
    {
      variantPlanId: "pro_annual",
      name: "Pro Annual",
      customize: { price: { amount: 200, interval: "year" } },
    },
  ],
})
```

## What the document means

- The document is the complete desired catalog. A feature or plan missing from it is a deletion (archived when customers depend on it).
- A collection that is omitted is "not mine": the server leaves it alone. `[]` means "mine, and empty".
- `plans` holds the active version of each plan; `planVersions` holds full rows of past versions. History a config states is enforced; history it omits is kept.
- Every version of a plan states a `versionSlug` once there is more than one. `atmn pull` and `atmn push` write `internalId` and `versionSlug` into fixtures after the server mints them; keep them, they are what lets a rename be a rename rather than delete + create.
- Versioning, propagation to variants, and migration drafts are the server's decisions: a push always asks for a draft migration wherever one is warranted, and the preview lists them.

## Headless update loop

1. Inspect or create `autumn.config.ts` (`atmn init` when there is none).
2. Edit the config to represent the desired catalog.
3. Run `atmn --headless push` to preview. Read the feature and plan sections, the customer impact, and the draft migrations it would create.
4. Show the user the diff and any deletions that will archive instead.
5. Run `atmn --headless push --yes` to apply the same preview.
6. Report created, updated, deleted and archived features and plans, and any migration links the output prints.

If the user changes the catalog shape, edit the config and preview again before applying. A config lint failure lists every problem at once with the file and line of the fixture at fault.

## Testing in a sandbox

- `atmn sandbox use <name>` pins a named sandbox; every command after it targets that sandbox until `atmn sandbox use --clear`. A key is minted for the machine when it has none.
- `atmn sandbox create <name> --use` mints a fresh one and pins it.
- `atmn reset --yes` empties the pinned sandbox; `atmn push --yes` rebuilds it from the config.
- `atmn env --json` says which sandbox, key and org a command would hit, with `notes` on what to do when the key is not the main sandbox's.

## What to show the user

- The preview's plan diffs, and which plans get a draft migration.
- Feature and plan deletions that will archive instead because dependencies or customers exist.
- Sandbox: which one is pinned before applying anything.
