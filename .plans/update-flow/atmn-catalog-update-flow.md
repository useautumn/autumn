# atmn Catalog Update Flow

## Goal

`atmn push` should mirror the dashboard save flow for plan updates:

- Review plan changes.
- Choose whether each customer-bearing plan versions or updates in place.
- Choose which variants receive base-plan changes.
- Optionally create a migration draft for customers who should receive an in-place update.

This is also the flow agents should follow when using catalog preview/update through MCP.

## Preview First

Call `catalog.preview_update` with the proposed catalog.

For plan updates, include preview details on the plan params when the caller needs
dashboard-style choices:

- `include_versions: true`: include historical version previews
- `include_variants: true`: include variant previews

Inspect each `plan_changes[]` entry:

- `action`: `created`, `updated`, `deleted`, `skipped`, or `none`
- `versionable`: true when a normal update would create a new version
- `migration`: draft that can be created if the plan is updated in place
- `other_versions[]`: historical versions affected by all-version choices
- `variants[]`: affected variants and propagation conflicts

For variants, inspect:

- `will_apply`: whether the current request already applies the base diff
- `has_customers` / `versionable`: whether applying can version that variant
- `conflicts[]`: why propagation may be ambiguous

## Ask The User

For every updated latest plan where `versionable` is true or the preview includes
historical versions, ask for one update target:

- `create_version`: grandfather existing customers
- `update_current`: patch the current catalog version only
- `update_all_versions`: patch every version
- `skip`: leave this plan unchanged

Only show the all-versions option when the base plan or selected variants have
historical versions in the preview.

If the user chooses `update_current` or `update_all_versions`, ask separately
whether to create a migration draft. This is independent: all versions can be
updated with or without a draft.

For every base plan with variant propagation prompts, ask which variants should receive the base-plan change.

Surface conflicts clearly. Example:

```txt
Variant pro_annual conflicts:
- Messages: different_interval (year)
```

When conflicts exist, recommend handling that variant separately unless the user explicitly confirms propagation.

## Headless atmn

Headless pushes must pass decisions explicitly when preview finds ambiguous update-flow prompts.

Examples:

```bash
bun atmn push --headless --yes \
  --plan-intents '{"pro":"create_version"}'

bun atmn push --headless --yes \
  --plan-intents '{"pro":"update_current"}'

bun atmn push --headless --yes \
  --plan-intents '{"pro":"update_current"}' \
  --migration-drafts '{"pro":true}' \
  --variant-propagations '{"pro":["pro_annual"]}'

bun atmn push --headless --yes \
  --plan-intents '{"pro":"update_all_versions"}' \
  --migration-drafts '{"pro":false}' \
  --variant-propagations '{"pro":["pro_annual"]}'
```

An empty variant list is explicit:

```bash
bun atmn push --headless --yes \
  --plan-intents '{"pro":"update_current"}' \
  --variant-propagations '{"pro":[]}'
```

## Update Semantics

`create_version`:

- Sends no `disable_version`.
- Existing customers stay on their current version.
- New attaches use the latest catalog version.

`update_current`:

- Sends `disable_version: true`.
- Existing customer rows are preserved where needed.
- Sends per-plan `create_migration: true` only when the separate migration choice is true.

`update_all_versions`:

- Sends `all_versions: true`.
- Updates every version of the base plan in place.
- Updates every version of selected variants in place.
- Sends per-plan `create_migration: true` only when the separate migration choice is true.

## Migration Drafts

Migration drafts are not run by catalog update.

Current defaults:

- custom plans excluded
- target customers filtered by plan id
- operations grouped by target version
- billing-change flag derived from the catalog diff

Agents should tell the user that creating the draft is separate from running it.
