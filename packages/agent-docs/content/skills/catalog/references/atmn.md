# atmn catalog flows

Contents: commands · when to use it · the config is the catalog's state (versions, renames, drafts) · variants and licenses · config shapes · splitting the config · update loop · pull · webhooks · sandboxes and keys · what to show the user.

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth.

Commands — these two, not `atmn preview` (that does not exist):

```sh
atmn push          # lints, then previews the diff; applies nothing
atmn push --yes    # apply exactly what the preview showed
```

`push` without `--yes` is always a dry run, on a clean org too, and it never asks anything: `--yes` is the only gate. The commands that do ask (`init`, `login --keyless`, `sandbox use`, `skills install`) print the flag to pass instead whenever there is no TTY, which is every agent run; `--headless` forces that in a terminal.

## When to use it

- New project: run `atmn init`. It connects (sign in, or keyless), places the config, pulls whatever the org already holds, and installs these skills beside it.
- Existing project: if `autumn.config.ts` exists, run `atmn pull` first so every row carries its server ids, then edit and push. Never rewrite a config that predates you from scratch.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## The config is the catalog's state

The document is the whole desired catalog for every collection it states. A plan or feature missing from a stated `plans` / `features` is a deletion (archived when customers depend on it). A collection left out entirely is not managed. That rule reaches down to versions: **a version row missing from `plans` is deleted too**.

Every version of a plan is a row in `plans`. Rows of one plan share a `planId`; each names its version with `versionSlug`; exactly one is `active: true` and the rest `active: false`. There is no history collection and no timeline — array order means nothing. What a version *is* (a group of customers, not a step in time) is the `autumn-concepts` skill's: read `references/plan.md` in the `autumn-concepts` skill. This file owns how rows express it.

Two fields make a row addressable:

- `planId` + `versionSlug` — what you write. The pair names exactly one version. `versionSlug` is required on every plan row and every variant row, including a plan's only version; an omitted slug is a lint error, never an implicit `v1`.
- `internalId` — the server's stable id. It is minted on the first `push --yes` and written back into the fixture; `pull` writes it for every row that lacks one. A fixture carrying it can be renamed (`planId`, `featureId`, `versionSlug`) and the server treats that as a rename, not a delete plus create.

**This is where atmn differs from the API and the dashboard.** Those send one plan entry plus flags — `versioning`, `active`, `propagate` — as `references/catalog-update.md` describes. A config has none of those flags. The intent is read off the rows — which rows exist, which one is active, which carry an `internalId` — and the preview reports what the server derived. If the preview says something other than what you meant, change the rows and preview again; never look for a flag.

| You want | Row edit | Preview shows |
|---|---|---|
| Change a version in place (active or history) | edit that row; keep its `versionSlug` and `internalId` | `~ pro@v1`, a migration for its customers |
| The same change on every version | make the edit on every row of the plan | one `~` per row |
| A new version; customers stay on the old one | add a row: same `planId`, new `versionSlug`, `active: true`, **no `internalId`**; flip the old row to `active: false` | `+ pro@v2`, and `active: true -> false` on the old row |
| A draft nobody can buy yet | add the row with `active: false` beside the active one | `+` with no pointer move |
| Rename the plan id | change `planId` on **every** row of the plan (all carry `internalId`) | a rename, not `-` + `+` |
| Rename a version | change `versionSlug` on a row that carries `internalId` | `Version slug` rename |
| Retire a version | remove its row | `-`; refused while customers are on it (it names both exits: migrate them, or archive the whole plan) |

Guards the lint applies before anything is sent: a plan with no active row or two active rows (`mark the one customers can buy active: true and the rest active: false`), a missing `versionSlug`, the same `planId` + `versionSlug` twice. A plan whose only row is `active: false` is refused — a draft needs an active sibling.

Numbers vs slugs: the server numbers versions in creation order and the preview labels rows with that number (`pro@v2`). The config never states numbers, only slugs. Push a `v1` row after `v2` already exists and the server numbers it higher; the slug still says `v1`. Never read a preview number back as the slug.

## Variants and licenses

What a variant's customize can change, when a base edit reaches a variant, and how a license link anchors to a child version are catalog-wide: `references/catalog-update.md`. What is atmn's:

- A variant is an entry in its base row's `variants` array and a license link an entry in the parent row's `licenses` array: `variant({...})` and `license({...})` fixtures, inline or imported from their own files, edited in place there. Pull writes new ones in that form. Every entry the config lists is a declared overlay; there is no `propagate` in a config, so a base edit reaches a variant through the entry you write, not a follow flag.
- Minting a base version means listing the variant entries again under the new base row, each with the new `versionSlug` and no `internalId`. The old entries stay under the old base row. One variant version cannot serve two base rows; the lint names both rows and says to version and relink the variant.
- To retire a variant, set `archived: true` on its entry. A variant left out of the array is a deletion, refused while customers hold it.
- Every `license({...})` states `versionSlug` — the lint refuses one without it — because the link is pinned to that child version and a config that names it links the same version in every environment. Pull writes it back. Minting a child version moves no parent; relinking a parent is editing that slug.

## Config shapes

`autumn.config.ts` uses the atmn package types, not raw API JSON. Field names are camelCase: `featureId`, `planId`, `billingMethod`, `billingUnits`, `freeTrial`, `intervalCount`, `versionSlug`. Follow the exported types from the package when editing config. Amounts are plain dollars: $20 is `20`, never `2000`.

Builders — `feature`, `plan`, `variant`, `license`. Items are plain objects on the plan; there is no `item()` builder and fixtures expose `featureId` / `planId`, never `.id`. A plan with an active `v2`, its `v1` kept for the customers still on it, each with an annual variant:

```ts
import { atmn, feature, plan, variant } from "atmn";

export const messages = feature({
  featureId: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

export const proAnnualV2 = variant({
  variantPlanId: "pro_annual",
  versionSlug: "v2",
  name: "Pro Annual",
  customize: { price: { amount: 250, interval: "year" } },
});

export const proAnnualV1 = variant({
  variantPlanId: "pro_annual",
  versionSlug: "v1",
  name: "Pro Annual",
  customize: { price: { amount: 200, interval: "year" } },
});

export const proV2 = plan({
  planId: "pro",
  versionSlug: "v2",
  active: true,
  name: "Pro",
  price: { amount: 25, interval: "month" },
  items: [{ featureId: messages.featureId, included: 10000, reset: { interval: "month" } }],
  variants: [proAnnualV2],
});

export const proV1 = plan({
  internalId: "prod_…", // written back by push --yes / pull
  planId: "pro",
  versionSlug: "v1",
  active: false,
  name: "Pro",
  price: { amount: 20, interval: "month" },
  items: [{ featureId: messages.featureId, included: 5000, reset: { interval: "month" } }],
  variants: [proAnnualV1],
});

export default atmn({ features: [messages], plans: [proV2, proV1] });
```

Before `proV2` existed, `proV1` was the active row; minting `v2` was adding `proV2` without an `internalId` and flipping `proV1` to `active: false`.

Usage-priced item:

```ts
{
  featureId: messages.featureId,
  included: 10000,
  reset: { interval: "month" },
  price: {
    amount: 0.9,
    billingMethod: "usage_based",
    billingUnits: 1000,
    interval: "month",
  },
}
```

## Splitting the config

`atmn init` scaffolds four files: `autumn.config.ts` (the root, `export default atmn({...})`), `features.ts`, `plans.ts`, `rewards.ts`. Every version of every plan lives in the `plans` array — active and history rows side by side. The config is ordinary TypeScript, so a row can be lifted into its own file under any export name and referenced from the array; `pull` follows imports and edits each fixture where it lives, and appends rows it has to add to the imported array. What it cannot do is edit a fixture that is not a plain literal — a spread, a helper call, a `.map()` — and it says so and writes nothing rather than guess.

## Update loop

1. Inspect or create `autumn.config.ts`.
2. Edit the config to represent the desired catalog.
3. Run `atmn push` to preview changes.
4. Show the user the plan diffs, the customer impact, which plans mint a new version, and the draft migrations it would create. If the versioning is not what they meant, change the rows (table above) and preview again.
5. Rerun `atmn push --yes` to apply the same preview.
6. Report created/updated/deleted/archived features and plans, and the draft migrations the output lists. `push --yes` also writes `internalId` (and any `versionSlug` the server assigned) back into the fixtures — say so; those edits are expected.

Two notes push prints that are worth relaying: a plan removed while an id-less plan appears looks like a rename — pull first so the fixture carries its id; and a config still stating a deprecated field (`entityFeatureId`) gets a note naming the replacement.

## Pull

`atmn pull` writes the server's catalog back into the config in place: it flips `active` where the dashboard promoted a version, appends versions the config never mentioned, and backfills `internalId` and `versionSlug`. Run it after anyone touches the dashboard, and before editing a config you did not write. With no config yet, `pull` asks which folder to create it in; headless, it prints the `-c <dir>` hint and stops, so run `atmn init` or pass `-c` instead.

`atmn pull --overwrite` is different: it rewrites `autumn.config.ts` and the `features.ts`, `plans.ts` and `rewards.ts` beside it from the server. It never deletes a file, and it leaves alone any file that does not import the package. It needs `--yes`, and it is the right move only when the config describes a different org than the key — the tell is `Your config no longer matches this org's catalog`. Anywhere else, a plain `pull` is what you want.

## Webhooks

`webhooks` in the config lists the Autumn webhooks it manages, keyed by `id`. Unlike the catalog it is never a deletion list: `push` creates or updates the webhooks it states and leaves every other webhook alone (the preview shows them as `unmanaged`).

`url` is a map keyed by environment, never one string. A missing key means "don't register this webhook there", which is not an error:

```ts
import { atmn, webhook } from "atmn";

export default atmn({
  webhooks: [
    webhook({
      id: "billing",
      events: ["billing.updated", "balances.limit_reached"],
      url: {
        live: "https://myapp.com/api/autumn",            // atmn push -p
        sandbox: "https://staging.myapp.com/api/autumn", // the default sandbox
        "qa-team": "https://qa.myapp.com/api/autumn",    // atmn sandbox use qa-team
      },
    }),
  ],
});
```

- Keys: `live` for `-p`, `sandbox` for the default sandbox, or a named sandbox's slug (its name lowercased; no spaces). Never copy a sandbox URL into `live`: ask the user for the production URL, or leave `live` out.
- Every URL must be https and publicly reachable; localhost and private networks are refused, tunnels such as ngrok work. `events` needs at least one entry.
- `id` is permanent: changing it registers a new webhook. Two ids that differ only by case or `-`/`_` are refused.
- The preview gives a changed URL its own line (`billing url: old → new`). Read it out to the user before `--yes`.
- `push --yes` writes each new webhook's signing secret once and prints exactly where: `AUTUMN_WEBHOOK_<ID>_SECRET` in `.env.prod` for `-p`, `AUTUMN_WEBHOOK_<ID>_<ORG4>_SECRET` in `.env.local` (or `.env`) for a sandbox. Relay the variable name and file; never print or read the secret.
- `pull` edits only the target env's key: it adds webhooks it finds, sets a changed URL, removes the env's key when the server no longer has that webhook, and deletes a webhook whose map ends up empty. A URL written as code (`process.env.X`) is never rewritten; pull warns when it differs from the server. Webhooks already in the dashboard will be pulled and be editable in the config once you pull as usual. Since the dashboard doesn't let you set an ID, a permanent ID will be assigned to this for future reference.

## Sandboxes and keys

- `atmn sandbox use <name>` pins a named sandbox; every command after it targets that sandbox until `atmn sandbox use --clear`.
- `atmn reset --yes` empties the pinned sandbox; `atmn push --yes` rebuilds it from the config.
- `atmn env --json` says which org, sandbox and key a command would hit, with `notes` on what to do when something is off.
- A missing key fails fast and names the fix: `AUTUMN_SECRET_KEY is not set. Run atmn login, or atmn login --keyless if you don't have an account.` — hand that to the setup flow, don't ask the user to paste a key.

## What to show the user

- Which plans mint a new version, and the draft migrations that come with them.
- Feature/plan/version deletions that will archive instead because dependencies or customers exist.
- Which sandbox is pinned before applying anything.
