# Catalog update flow

Contents: ground rules · the update model (desired state, two ways to state it, addressing a row, versioning, variants, licenses, features) · loop · reading the preview · deciding per plan · what to report.

Use this when customers are on these plans and the user wants to change pricing or plans. A half-built config from a setup session is not this — keep building with the normal workflow. What a version, a draft and `active` mean is the `autumn-concepts` skill's: read `references/plan.md` in the `autumn-concepts` skill. How rows in `autumn.config.ts` express the same intents: `references/atmn.md`.

## Ground rules

- Never run the new-catalog interview against a live catalog. Read the current catalog first; it is the truth to diff against, not a draft to replace.
- Touch only what the change names. Every other plan, item and id stays byte-identical — rewriting untouched plans is the classic update failure.
- Match the existing catalog's patterns; if sibling plans model a thing one way, the change follows that way.
- The questions are "who's affected", not "what do you sell": new version or edit in place? all versions? which variants and license parents follow? migrate customers or grandfather them?
- Structural changes ("add seats", "make credits shared") re-enter the Shape forks exactly as a new catalog would.
- Preview before every write; apply only the exact previewed params.

## The update model

Read with `catalogV2.get` (`include_versions: true` to see every version). Preview with `catalogV2.preview_update`, apply with `catalogV2.update` — the same params, so a preview is always exactly what apply would do. `catalogV2.diff` is a read-only delta with no write validation, for reconciling a local copy.

**The payload is desired state, per collection.** `features`, `plans`, `rewards`, `referral_programs`: a collection left out is untouched. With `skip_deletions: false` a stated collection is complete and anything missing from it is removed; with `skip_version_deletions: false` the same holds for a stated plan's versions. Removal archives rather than deletes whenever customers hold the row. `remove_plans` (optionally pinned to one version) and `remove_features` remove by name under the default; `skip_plan_ids` shields plans from a complete payload.

**Two ways to state a change.** A targeted payload states only the plan being changed and says who follows through `propagate` — that is how the dashboard and API or MCP callers work. A whole-catalog payload states every plan, every version and every variant, and flips both `skip_*_deletions` off — that is what `autumn.config.ts` sends. Both reach the same server; pick the one matching the surface you are on and don't mix them.

**If the surface is atmn**, the same model applies with these differences, which decide whether an edit does what you meant (mechanics in `references/atmn.md`):

- The config is the complete state of every collection it names. A plan, version or variant left out is a deletion, not "unchanged".
- There are no `versioning`, `propagate` or follow flags. Intent is read off the rows: a row with a new `versionSlug` and no `internalId` mints a version, flipping `active` promotes, every variant the base lists is an explicit overlay, and a license link names its child version.
- Rows are addressed by the stable `internalId` the CLI writes back after `push --yes` and `pull`. Renaming a plan id, feature id or version slug is safe only on a row that carries it — so run `atmn pull` before editing a config you did not write.
- The lint runs before anything is sent, and preview then apply are `atmn push` and `atmn push --yes` with the same config, so a push previews exactly what it would apply.

**Addressing a row.** `plan_id` names the plan; `version_slug` pins one version, and omitting it targets the active row. `internal_id` addresses a row by its stable id, which is what makes `plan_id` and `version_slug` renames safe; without it, `new_plan_id` renames and is blocked while customers or reward programs reference the id.

**Versioning.** `versioning` is `existing` (default: edit the addressed row), `all_versions` (the same edit on every version), or `new_version` (mint the next version; customers stay where they are). `active: true` promotes the minted row; omit it to mint a draft. `new_version_slug` names the minted row. `migration: { draft: true }` creates a migration draft for customers on an in-place or all-versions edit; it is rejected with `new_version`, because minting is the choice to leave customers alone.

**Variants.** They live under the base entry's `variants[]`, never as top-level plans. Each entry is a declared overlay: `customize.items` replaces the item list, `add_items` / `remove_items` patch it, `price` and `free_trial` override. Declaring an entry is not the same as following: a base edit reaches a variant only when `propagate.variants` names it (pinned by `version_slug`), and relatives not named are frozen. When the base mints a new version, a following or overlaid variant with customers mints its next version too. To retire a variant, set `archived: true` on its entry. Nesting an entry under a base links it there; `base_variant_id: null` detaches it.

**Licenses.** A parent's `licenses[]` entry names `license_plan_id`, `included`, `prepaid_only`, an optional `version_slug` and a `customize` (price, add or remove items). A link is pinned to one child version, named by `version_slug`. Versioning the child moves no parent: moving a parent onto the new child version is an explicit change to its link. `propagate.license_parents` lets named parents follow a child edit; anything not named stays pinned. The preview's `license_parents` lists the parents pointing at a child row being changed.

**Features.** `new_feature_id` renames; `archived` archives or restores. A plan may reference a feature stated in the same payload.

## Loop

1. Read the current catalog and the proposed change.
2. Build params for only what changes.
3. Preview. Never skip this before a write.
4. Summarize what the preview reports (below) and settle the decisions per plan.
5. If anything changed, revise and preview again.
6. Apply with the exact previewed params, under the global write-approval rules.
7. Report, including any migration draft — it moves nobody until it is reviewed and run.

## Reading the preview

Per plan entry:

- `action` is per plan id: `create` means no live version existed, `update` covers edits and minting alike; `will_archive` says a removal archives instead. `state.usage` carries capped customer counts; `state.reasons` are ready-made lines for why something archives or is blocked.
- `versioning` says what actually happens (`new_version` is null when an existing row is edited) and `options` lists the strategies available for this plan today — offer only those.
- `sibling_versions`: the other versions that could receive the same edit, each with the slots it had diverged on that the edit would overwrite.
- `variants[]`: each resolved as `unchanged` (frozen), `propagated` (followed) or `explicit` (the payload declared it), with conflicts — slots the variant already overrides. Conflicts inform the decision; they never block.
- `license_parents[]`: the same three states for parents whose link points at this row.
- Feature entries carry blockers that would reject the update; check them before applying.
- Top level: the migration drafts the update would create.

## Deciding, per plan

1. **Versioning.** If the change touches no base price and no priced item, edit in place (`existing`, or `all_versions` when every customer group should get it) and say so — no question needed. If it changes a base price or a priced item on a plan with customers, ask: new version (they keep their terms) or in place plus a migration draft (they move to the new terms)? Offer only what `options` lists.
2. **Relatives.** Default to following conflict-free variants and license parents; ask before following into a conflict, showing what would be overwritten.
3. **Migration.** For an in-place edit on a plan with customers, offer the draft. Never create one alongside `new_version`.

## What to report

Which plans mint a new version and which are edited in place; which variants and parents follow; deletions that archive because customers or dependencies exist; and the migration drafts created, with the reminder that they still have to be run.
