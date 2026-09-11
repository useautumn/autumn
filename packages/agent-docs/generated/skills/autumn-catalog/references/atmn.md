# atmn catalog flows

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth.

Commands — these two, not `atmn preview` (that does not exist):

```sh
atmn --headless push          # validates and previews the diff; applies nothing
atmn --headless push --yes    # apply exactly what the preview showed
```

`--headless push` without `--yes` is always a dry run, on a clean org too. Nothing reaches the server as a write until `--yes`.

## When to use it

- New project: run `atmn init`. It signs in (or goes keyless), places the config, pulls whatever the sandbox already holds, and installs these skills beside it.
- Existing project: if `autumn.config.ts` exists, inspect and edit it before pushing. `atmn pull` writes the server's catalog back into it in place.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## Config shapes

`autumn.config.ts` uses the atmn package types, not raw API JSON. Field names are camelCase: `featureId`, `planId`, `billingMethod`, `billingUnits`, `freeTrial`, `intervalCount`, `versionSlug`. Follow the exported types from the package when editing config. Amounts are plain dollars: $20 is `20`, never `2000`.

Core builders — `feature`, `plan`, `variant`, `license`. Items are plain objects on the plan. A variant is its own `variant({...})` fixture, listed by name in its base plan's `variants`; its `customize` carries what differs from the base (`price`, `items` to replace the list, `addItems` / `removeItems` to patch it).

```ts
const messages = feature({
  featureId: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

export const proAnnual = variant({
  variantPlanId: "pro_annual",
  name: "Pro Annual",
  customize: { price: { amount: 200, interval: "year" } },
});

export const pro = plan({
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
  variants: [proAnnual],
});

export default atmn({ features: [messages], plans: [pro] });
```

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

The document is the whole desired catalog for every collection it states: a plan or feature missing from a stated `plans` / `features` is a deletion (archived when customers depend on it). A collection left out entirely is not managed.

Two fields make a fixture addressable, and both are typed optional only because they come from the server:

- `internalId` — the row's stable id. The server mints it on the first `push --yes` and the CLI writes it back into the fixture; `pull` writes it for every row that lacks one. A fixture that carries it can be renamed (`planId`, `featureId`) and the server treats that as a rename. Run `atmn pull` before editing a config that predates you, so every fixture already carries its id.
- `versionSlug` — the version's name (`"v1"`, `"2026-q3"`). State it on every plan row you write, active or history, including the first version: it is how the config tells versions of one plan apart, and the lint refuses a second version without one.

## Splitting the config

`autumn.config.ts` is ordinary TypeScript, so a catalog can be laid out however the user likes: everything in one file, or fixtures exported from their own files and imported into the root arrays. A common shape is one plan per file with `planVersions/` holding the history rows, which is why `atmn init` scaffolds that folder. `pull` follows imports and edits fixtures where they live.

## Headless update loop

1. Inspect or create `autumn.config.ts`.
2. Edit the config to represent the desired catalog.
3. Run `atmn --headless push` to preview changes.
4. Show the user the plan diffs, the customer impact, which plans mint a new version, and the draft migrations it would create. If the versioning is not what they meant, move rows (see "Versions: code in motion") and preview again.
5. Rerun `atmn --headless push --yes` to apply the same preview.
6. Report created/updated/deleted/archived features and plans, and the migration links the output prints.

If the user changes the catalog shape, edit `autumn.config.ts` and preview again before pushing.

## Versions: code in motion

There are no decision flags. Versioning is stated by where a row sits and what it says; the server derives the rest and the preview shows it. `plans` holds each plan's active version, `planVersions` its history, and every row names its version with `versionSlug`. On a plan with customers:

- **Change every version.** Make the edit on the active row in `plans` and on each history row in `planVersions/`. Each row is updated in place; a draft migration is offered for the customers on each.
- **Change only the active version.** Edit the row in `plans`, keep its `versionSlug`. It is updated in place, history untouched; customers on it get a draft migration.
- **Mint a new version, leaving customers where they are.** Move the current active fixture to `planVersions/` (its file, and its entry from `plans` into `planVersions` in the root config — a row still listed in `plans` is still the active one). Write the new active row in `plans` with the same `planId`, a new `versionSlug`, and no `internalId`: an absent id is what tells the server this is a new row, and `push --yes` writes the minted one back. The preview lists it as a new version with the old one going inactive.

Variants move with their base. An in-place edit to the base reaches each variant listed under it unless that variant's `customize` overrides the field. Minting a new base version means minting a new version of every variant linked to it: the new active base row lists variant fixtures carrying the same new `versionSlug` (and no `internalId`), and the old variant fixtures move to `planVersions/` alongside the old base. A new base version that still points at the old variant rows is refused by the lint, since one variant version cannot serve two base versions.

## Sandboxes

- `atmn sandbox use <name>` pins a named sandbox; every command after it targets that sandbox until `atmn sandbox use --clear`.
- `atmn reset --yes` empties the pinned sandbox; `atmn push --yes` rebuilds it from the config.
- `atmn env --json` says which org, sandbox and key a command would hit, with `notes` on what to do when something is off.

## What to show the user

- Which plans mint a new version, and the draft migrations that come with them.
- Feature/plan deletions that will archive instead because dependencies or customers exist.
- Which sandbox is pinned before applying anything.
