# Entities and Licenses Plan

## Goal

Add customer-owned license inventory that can be assigned to entities.

Model licenses as **existing Autumn products/plans used as provisionable subplans**, not a separate license catalog.

```text
parent product
  -> license planLicense
    -> license product/subplan
      -> customer license pool
        -> entity assignment
```

## Core Decisions

- Reuse `products` for license subplans.
- Do not add `products.is_license`.
- Add `products.catalog_type` to separate normal catalog plans from license subplans.
- Do not add a separate `license_definitions` table.
- Do not put license planLicenses in plan `items`, `config`, or `metadata`.
- Add license relationships only where the current schema lacks them.
- Normal product/plan lists must default to `catalog_type = "plan"`.
- Load license subplans only by explicit ID or internal license-specific query paths.

Optional later: add a `license_products` role table if we need a dedicated license-subplan catalog independent of parent plan planLicenses.

## Data Model

### Existing `products`

License subplans are normal product rows:

- `products.id = "workspace_license"` or similar.
- `catalog_type = "license"`.
- `is_add_on = true` where appropriate.
- Existing prices, entitlements, versions, Stripe resources, and dashboard/API behavior apply.

Normal visible plans use:

- `catalog_type = "plan"`.

Rules:

- `catalog_type` is `text not null default "plan"`, typed in TS/Zod as `"plan" | "license"`.
- Use app-level typing, not a Postgres enum, matching existing schema style.
- `is_add_on` remains billing/attach behavior, not catalog visibility.
- `is_default = true` should be rejected for `catalog_type = "license"`.
- `billing.attach` should reject license products unless called through license assignment/provisioning flows.
- Existing product version rows should keep the same `catalog_type`.

### `plan_license`

Parent-plan-to-license-subplan relationship.

Fields:

- `id`
- `org_id`
- `env`
- `parent_internal_product_id -> products.internal_id`
- `license_internal_product_id -> products.internal_id`
- `included_quantity`
- `allow_extra_quantity`
- `metadata`
- timestamps

Indexes:

- Unique `(parent_internal_product_id, license_internal_product_id)`.
- Index `parent_internal_product_id`.
- Index `license_internal_product_id`.
- Index `(org_id, env)`.

### `license_pools`

Customer-owned inventory for one parent subscription and planLicense.

Fields:

- `id`
- `org_id`
- `env`
- `internal_customer_id -> customers.internal_id`
- `parent_customer_product_id -> customer_products.id`
- `plan_license_id -> plan_license.id`
- `license_internal_product_id -> products.internal_id`
- `license_customer_product_id -> customer_products.id`, nullable
- timestamps

Indexes:

- Unique `(parent_customer_product_id, plan_license_id)`.
- Index `internal_customer_id`.
- Index `parent_customer_product_id`.
- Index `license_internal_product_id`.
- Index `(internal_customer_id, license_internal_product_id)`.
- Index `(org_id, env, internal_customer_id)`.

Notes:

- No independent billing status.
- No independent paid quantity source of truth.
- Included quantity comes from the planLicense.
- Paid quantity comes from the linked license customer product when extras are purchased.

### `license_assignments`

Ledger of entity assignments.

Fields:

- `id`
- `org_id`
- `env`
- `license_pool_id -> license_pools.id`
- `internal_customer_id -> customers.internal_id`
- `internal_entity_id -> entities.internal_id`
- `license_internal_product_id -> products.internal_id`
- `provisioned_customer_product_id -> customer_products.id`, nullable
- `started_at`
- `ended_at`
- `metadata`

Indexes:

- Index `license_pool_id`.
- Index `internal_customer_id`.
- Index `internal_entity_id`.
- Index `(internal_customer_id, license_internal_product_id)`.
- Partial index `license_pool_id WHERE ended_at IS NULL`.
- Partial unique `(license_pool_id, internal_entity_id) WHERE ended_at IS NULL`.
- Partial unique `(org_id, env, internal_customer_id, internal_entity_id, license_internal_product_id) WHERE ended_at IS NULL`.

Use `ended_at IS NULL` for active assignments.

## Query Model

Default product queries should not join license tables and should not return license subplans.

Default filters:

- Public `plans.list`: `catalog_type = "plan"`.
- Legacy product/plan list routes: `catalog_type = "plan"`.
- Dashboard `/products/products`: `catalog_type = "plan"` unless an internal license picker asks otherwise.
- Customer billing tables: hide provisioned license products from normal subscription management views unless rendering a license-specific section.
- `include_archived` and `all_versions` must not override catalog visibility.

Service boundaries:

- `ProductService` is raw product storage access and returns all catalog types by default.
- `PlanService` wraps plan-facing reads with `catalog_type = "plan"`.
- `LicenseService` owns license product reads plus planLicenses, pools, and assignments.

Load license planLicenses only through license-specific paths:

- dashboard plan editor
- checkout/attach validation
- license assignment flows
- customer/entity license views

Efficient lookup paths:

- Parent plan planLicenses: `plan_license(parent_internal_product_id)`.
- Products used as license subplans: `plan_license(license_internal_product_id)`.
- License picker: `products WHERE org_id = ? AND env = ? AND catalog_type = "license"`.

Implementation notes:

- Keep normal product/plan flows on `PlanService`.
- Keep raw catalog/internal tooling on `ProductService`.
- Keep license-specific product lookup inside `LicenseService`.
- Apply catalog filters inside latest-version queries, not after fetching.
- Include catalog scope in product cache keys or bump the product cache version.
- Add `(org_id, env, catalog_type)` index only if license catalog queries become hot; V1 can rely on existing org/env/id/version access.

If global license catalog queries become common, add:

```text
license_products
  internal_product_id -> products.internal_id
  org_id
  env
  metadata
```

Do this only when needed; do not add `is_license` to `products`.

## Why `is_add_on` Is Not Enough

`is_add_on` only controls add-on billing/transition behavior and dashboard grouping.

Today, add-ons are still normal visible plans:

- public `plans.list` returns add-ons
- dashboard product list shows an "Add-on subscriptions" section
- attach selectors include add-ons

License subplans need a separate catalog visibility role. That is why `catalog_type` is required.

## Inventory

```text
included_quantity = plan_license_planLicense.included_quantity
paid_quantity = linked license customer_product paid quantity, default 0
assigned = active license_assignments count
available = included_quantity + paid_quantity - assigned
```

Assignment must run under a customer-level lock and DB transaction to avoid overbooking.

## Runtime Rules

- Assignment is an Autumn provisioning action, not normal `billing.attach`.
- If the license should grant entity-level access, create an entity-scoped provisioned `customer_product` for the license subplan.
- Provisioned entity products must not create separate Stripe billing.
- Paid extras bill only through the pool/add-on customer product.
- Unassign sets `ended_at`, releases inventory, and has no Stripe side effect in V1.

Provisioned entity product rules:

- Set `subscription_ids = []`.
- Set `scheduled_ids = []`.
- Avoid `customer_prices` where possible.
- Insert the provisioned customer product and its entitlements so existing checks work.

## API Shape

Plan responses remain plan-only. Fetch license planLicenses separately.

Attach can include initial assignments:

```ts
license_assignments?: Array<{
  entity_id: string;
  plan_id: string;
  version?: number;
  subscription_id?: string;
  feature_quantities?: unknown[];
  customize?: unknown;
}>;
```

License endpoints:

- `POST /v1/licenses.assign`
- `POST /v1/licenses.unassign`
- `POST /v1/licenses.list_assignments`
- `POST /v1/licenses.list_pools`
- `POST /v1/licenses.set_plan_license`
- `POST /v1/licenses.list_plan_licenses`
- `GET /v1/products/license_products`

Do not expose raw `customer_product_id` by default. Use public subscription IDs where needed.

## Dashboard MVP

Plan editor:

- Show `License planLicenses` beside features.
- Let users select/create a license subplan.
- Configure included quantity and whether extras are allowed.
- Edit the license subplan as a normal plan.

Customer/entity view:

- Show license pools with included, paid, assigned, and available counts.
- Assign to an existing entity.
- Show assigned licenses as entity-scoped subscriptions labeled as licenses.
- Unassign from the assignment list/detail view.

## Tests

- Default product/plan lists exclude `catalog_type = "license"`.
- `include_archived` and `all_versions` still exclude license subplans by default.
- License subplans can be loaded by explicit ID for license planLicense and assignment flows.
- Add-ons remain visible when `catalog_type = "plan"`.
- Plan items remain feature/price rows; planLicenses are separate from `items`.
- Plan responses do not include license planLicenses by default.
- Attach creates pools and paid-extra products only when needed.
- Included quantity is not billed.
- Assignment creates one active assignment and, when required, one provisioned entity product.
- Provisioned entity product creates no Stripe invoice/subscription item.
- Duplicate or retried assignment does not double-consume inventory.
- Concurrent assignments cannot overbook.
- Unassign expires the assignment and provisioned product once.

## V1 Non-Goals

- `licenses.attach`.
- `products.is_license`.
- Separate license definition catalog.
- True metered PAYG or allocated invoice true-up.
- Refunds, credits, prorations, or paid quantity reduction on unassign.
- Unlimited pools.
- Replacement groups across license subplans.
- Auto-created entities during assignment.
- Automatic parent-plan license migration on upgrade/downgrade.
