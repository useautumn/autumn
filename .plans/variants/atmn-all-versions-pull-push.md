# atmn All-Version Pull / Push Plan

## Summary

atmn should remain latest-only by default. Historical catalog support should be
opt-in through an explicit all-versions mode.

The current variant model is method-style:

```ts
export const pro = plan({...});
export const proAnnual = pro.variant({...});
```

All-version support should extend this model rather than introduce top-level
`variant(...)` or `variants: []` config.

The current variant model links variants to the latest version of the base plan.
All-version support should preserve base versions and variant versions without
pinning variants to historical base versions:

```txt
pro v1
pro v2
  pro_annual v1
  pro_annual v2
  pro_annual v3
```

This means local identity is no longer just `id`:

- Base plan: `(plan_id, version)`
- Variant: `(variant_plan_id, version)`
- Variant family: `base_plan_id`

## Backend Contract

Add all-version read support:

```ts
plans.list({
  include_archived: true,
  all_versions: true,
});
```

Response requirements:

- Return every base plan version.
- Return every variant plan version.
- Include `version` on every plan response.
- Include `variant_details.base_plan_id` on variant responses.
- Include `variant_details.customize` on variant responses.

Do not add `variant_details.base_plan_version` for now. Variants belong to the
latest base version.

Add version-targeted catalog writes:

```ts
catalog.preview_update({
  plans: [
    { plan_id: "pro", version: 1, ... },
    { plan_id: "pro", version: 2, ... },
  ],
});
```

Variant updates live under the latest base version:

```ts
catalog.update({
  plans: [
    {
      plan_id: "pro",
      version: 2,
      variants: [
        { variant_plan_id: "pro_annual", version: 1, ... },
        { variant_plan_id: "pro_annual", version: 2, ... },
        { variant_plan_id: "pro_annual", version: 3, ... },
      ],
    },
  ],
});
```

If a catalog request includes variants under a non-latest base version, preview
and update should reject it.

Preview rows should include `version` directly, not only through expanded `plan`:

```ts
{
  plan_id: "pro",
  version: 2,
  action: "updated",
}
```

Variant preview rows should also include `version`.

## atmn Pull

Default behavior stays unchanged:

```sh
atmn pull
```

- Fetches latest plans only.
- Emits current single-file config.
- Uses `basePlan.variant(...)`.

All-version mode:

```sh
atmn pull --all-versions
```

- Calls `plans.list({ include_archived: true, all_versions: true })`.
- Groups base plans by `(id, version)`.
- Groups variants under the latest base plan for each `base_plan_id`.
- Emits version-suffixed exports.

Example output:

```ts
export const proV1 = plan({
  id: "pro",
  version: 1,
  name: "Pro",
  items: [...],
});

export const proV2 = plan({
  id: "pro",
  version: 2,
  name: "Pro",
  items: [...],
});

export const proAnnualV1 = proV2.variant({
  id: "pro_annual",
  version: 1,
  name: "Pro Annual",
  customize: {...},
});

export const proAnnualV2 = proV2.variant({
  id: "pro_annual",
  version: 2,
  name: "Pro Annual",
  customize: {...},
});

export const proAnnualV3 = proV2.variant({
  id: "pro_annual",
  version: 3,
  name: "Pro Annual",
  customize: {...},
});
```

Codegen rules:

- Latest-only exports may stay clean: `pro`, `proAnnual`.
- All-version exports use suffixes: `proV1`, `proV2`, `proAnnualV1`.
- Collision maps must key by `(id, version)`, not `id`.
- In-place update must parse `version` from plan and variant exports.
- Standalone variant exports remain ignored by config loading because calling
  `pro.variant(...)` mutates the base plan object.

## atmn Push

Default behavior stays unchanged:

```sh
atmn push
```

- Sends latest-only catalog shape.
- Uses current catalog preview/update behavior.
- Configured variants are sent under their base plan's `variants` array.

All-version mode:

```sh
atmn push --all-versions
```

- Loads all plan and variant exports.
- Sorts base plan updates by `(plan_id, version)`.
- Sorts variant updates by `(variant_plan_id, version)`.
- Sends one catalog preview/update payload containing the version graph.
- Uses `skip_deletions: false` only against stable plan families, not individual
  historical versions.

Write semantics:

- `version: 1` missing remotely: create base plan.
- `version: 2+` missing remotely: create by versioning from the previous version.
- Existing exact version with identical shape: no-op.
- Existing exact historical version with customers and different shape: blocked
  unless we explicitly support unsafe rewrite semantics.
- Variant `version: 1` missing: create from the latest base version.
- Variant `version: 2+` missing: create by versioning the previous variant
  version.
- Variant writes under non-latest base versions are rejected.

## Catalog Preview Behavior

Preview must be incremental and version-aware.

For input:

```ts
plans: [
  { plan_id: "pro", version: 1, ... },
  { plan_id: "pro", version: 2, ... },
]
```

Preview should evaluate v1 first, then v2 against the virtual result of v1.

This matters because:

- v2 may not exist until v1 is created.
- Variant updates must be evaluated against the latest base version.
- Feature removals should consider the final virtual catalog, not only the
  persisted starting state.

Preview output should be auditable:

```ts
{
  plan_changes: [
    {
      plan_id: "pro",
      version: 1,
      action: "none",
    },
    {
      plan_id: "pro",
      version: 2,
      action: "created",
    },
  ],
}
```

## Deletion / Replacement Semantics

In latest-only mode:

- Current `skip_deletions` behavior remains unchanged.

In all-version mode:

- Missing latest plan family means delete/archive the whole family.
- Missing individual historical version should not silently delete that version.
- Deleting a specific historical version should require an explicit future API
  shape.
- Variants are skipped from top-level plan deletion, as they are owned through
  their base plan's `variants`.

## Tests

Backend tests:

- `plans.list` latest-only by default.
- `plans.list({ all_versions: true })` returns every base and variant version.
- Variant response includes `base_plan_id` and no `base_plan_version`.
- `catalog.preview_update` accepts duplicate `plan_id` with different `version`.
- `catalog.update` creates missing base v1 and v2 in order.
- `catalog.update` rejects variants under non-latest base versions.
- `catalog.update` creates variant versions under the latest base version.
- Existing customer-bearing historical version with changed config is blocked or
  clearly skipped.
- Preview rows include `version` without requiring `expand`.

atmn tests:

- `pull` latest-only still emits clean method-style variants.
- `pull --all-versions` emits version-suffixed base and variant exports.
- Pull attaches all variant versions to the latest base version.
- Config load ignores standalone variant exports but keeps them attached to base
  plans.
- `push --all-versions` sends versioned catalog params.
- Push round-trip recreates base v1, base v2, and variant v1/v2/v3 under base v2.
- Latest-only push behavior remains unchanged.

## Follow-Up Notes

The existing `.plans/variants/atmn-variants-schema.md` should be updated later
because it still describes the older proposed `variant(...)` / `variants: []`
shape. The current implementation is method-style `basePlan.variant(...)`, so
any all-version doc should treat that as the source of truth.
