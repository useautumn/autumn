# Plan id alias — ingress mapping

After rename `pro → proNew`, public callers may still send `pro`. Ingress rewrites
to `proNew` before handlers; responses stay canonical (no `alias_id` in API).

Mechanisms:

| Mechanism | Where | Notes |
|---|---|---|
| `planAliasMiddleware` | `/v1/*` (`apiRouter`), `/webhooks/vercel/:orgId/:env/*` | Body via `rewritePlanIdAliasValues`; path via `rewritePlanIdAliasParams` |
| Manual rewrite | Stripe `checkout.session.completed` metadata | `setupCheckoutSessionCompletedContext.ts` |
| None | `internalRouter`, Stripe/RevenueCat webhooks (except above), `publicRouter`, `cliRouter` | See intentional skips |

Rewrite keys: `planIdAliasRewriteKeys.ts` (`PLAN_ID_ALIAS_REWRITE_KEYS`).

Path params rewritten: `product_id`, `productId` only — never `customer_id`.

Create-plan skip keys (body only): `plan_id`, `id`, `product_id` on
`POST /products`, `POST /plans`, `POST /plans.create`.

---

## Path params (`rewritePlanIdAliasParams`)

| # | File / route | Param | Middleware | Notes |
|---|---|---|---|---|
| 1–8 | `productRouter.ts` → `/v1/products/:product_id` | `product_id` | ✓ | GET, POST, PATCH, DELETE, copy, has_customers×2, deletion_info |
| 9–16 | same router → `/v1/plans/:product_id` | `product_id` | ✓ | alias mount of `honoProductRouter` |
| 17 | `vercelWebhookRouter.ts` GET `.../v1/products/:productId/plans` | `productId` | ✓ | List billing plans |
| 18–22 | `internalProductRouter.ts`, `internalCusRouter.ts` | `productId` / `product_id` | **intentionally skipped** | Dashboard session auth; no `planAliasMiddleware` |
| — | `vercelWebhookRouter.ts` `:productId` on create-resource body | body `productId` | **intentionally skipped** | Vercel marketplace resource id, not an Autumn plan id |

---

## JSON body — `/v1` RPC & REST (via `planAliasMiddleware`)

### Plans (`plansRpcRouter` + `honoProductRouter`)

| # | Route / handler | Schema field(s) | Key(s) |
|---|---|---|---|
| 23 | `POST /plans.get` | `plan_id` | `plan_id` |
| 24 | `POST /plans.create` | `plan_id` | **skip** (create route) |
| 25 | `POST /plans.update` | `plan_id`, `new_plan_id`, `base_plan_id`, `update_variant_ids`, `variants[].variant_plan_id`, `variants[].base_variant_id`, `licenses[].license_plan_id`, `update_license_parents[].plan_id` | mixed — `new_plan_id` **not** rewritten |
| 26 | `POST /plans.delete` | `plan_id` | `plan_id` |
| 27 | `POST /plans.preview_update` | same as update | mixed |
| 28 | `POST /plans.create_variant` | `base_plan_id`, `variant_plan_id` | both |
| 29 | `POST /plans.has_customers` | body `plan_id` (RPC); REST uses path | `plan_id` + path |
| 30 | `POST /products` (REST create) | `id` (v1), body keys | **skip** `plan_id`/`id`/`product_id` |
| 31 | `POST/PATCH /products/:product_id` (v1 update) | plan shape fields | `base_plan_id`, etc. |
| 32 | `POST /products/:product_id/copy` | `CopyProductParams.id` | **intentionally skipped** — new id in target env, not alias lookup |

### Catalog V2 (`catalogV2RpcRouter`)

| # | Route | Schema field(s) | Key(s) |
|---|---|---|---|
| 33 | `POST /catalogV2.update` | `plans[].plan_id`, `new_plan_id`, `base_plan_id`, `base_variant_id`, `variants[].*`, `licenses[].license_plan_id`, `propagate.*.plan_id`, `remove_plans[].plan_id` | mixed |
| 34 | `POST /catalogV2.preview_update` | same tree | mixed |

### Catalog V1 (`catalogRpcRouter`)

| # | Route | Schema field(s) | Key(s) |
|---|---|---|---|
| 35 | `POST /catalog.update` | `plans[].plan_id`, `skip_plan_ids`, nested variants/licenses | `plan_id`, `skip_plan_ids`, … |
| 36 | `POST /catalog.preview_update` | same | same |
| 37 | `POST /catalog.update_mappings` | `plan_mappings[].plan_id` | `plan_id` |

### Billing (`billingRpcRouter` + `billingRouter`)

| # | Route | Schema field(s) | Key(s) |
|---|---|---|---|
| 38 | `POST /billing.attach` | `plan_id`, `remove_plan_ids`, `license_quantities[].license_plan_id`, `customize.upsert/remove_licenses[].license_plan_id` | all |
| 39 | `POST /billing.preview_attach` | same | same |
| 40 | `POST /billing.update` | `plan_id`, license customize | same |
| 41 | `POST /billing.preview_update` | same | same |
| 41 | `POST /attach` (legacy) | `product_id`, `product_ids`, `remove_plan_ids` | `product_id`, `product_ids` |
| 42 | `POST /attach/preview` | legacy attach shape | `product_id` |
| 43 | `POST /cancel` | `product_id` | `product_id` |
| 44 | `POST /billing.multi_attach` | `plans[].plan_id` | `plan_id` |
| 45 | `POST /billing.preview_multi_attach` | same | same |
| 46 | `POST /billing.multi_update` | `updates[].plan_id` | `plan_id` |
| 47 | `POST /billing.preview_multi_update` | same | same |
| 48 | `POST /billing.create_schedule` | `phases[].plans[].plan_id`, `unscheduled_plans[].plan_id` | `plan_id` |
| 49 | `POST /billing.preview_create_schedule` | same | same |
| 50 | `POST /billing.sync` / `sync_v2` | `phases[].plans[].plan_id` | `plan_id` |
| 51 | `POST /billing.setup_payment` | `plan_id` | `plan_id` |
| 52 | `POST /billing.resolve_request` | nested attach/schedule/update bodies | recursive |
| 53 | `POST /billing.dfu.flash` (internal) | `plans[].plan_id` | `plan_id` |

### Balances

| # | Route | Field | Key |
|---|---|---|---|
| 54 | `POST /check` | `product_id` (legacy) | `product_id` |

### Licenses (`licenseRpcRouter`)

| # | Route | Field | Key |
|---|---|---|---|
| 55 | `POST /licenses.attach` | `plan_id` | `plan_id` |
| 56 | `POST /licenses.release` | `license_plan_id` | `license_plan_id` |

### Rewards & referrals (`rewardRouter`, `rewardProgramRouter`)

| # | Route | Field | Key |
|---|---|---|---|
| 57 | `POST /rewards` | `coupon.plan_ids` | `plan_ids` |
| 58 | `PUT /rewards/:id` | `coupon.plan_ids` | `plan_ids` |
| 59 | `POST /reward_programs` | `plan_ids` | `plan_ids` |
| 60 | `PUT /reward_programs/:id` | `plan_ids` | `plan_ids` |

### Migrations V2 (`migrationRpcRouter` on `/v1` and internal)

| # | Route | Field | Key |
|---|---|---|---|
| 61–68 | `migrations.create/update/...` | `operations[].add_plan.plan_id`, `operations[].update_plan.plan_filter.plan_id`, nested `$or` | `plan_id` (recursive) |
| 69 | `migrations.filter.preview` | filter may embed plan filters in stored migration | via loaded ops |

### Platform / org (under `/v1/organization` or RPC)

| # | Route | Field | Key |
|---|---|---|---|
| 70 | `POST /organization/revenuecat/sync` | `product_ids` | `product_ids` |
| 71 | `POST /organization/revenuecat/mappings` | `mappings[].autumn_product_id` | `autumn_product_id` |
| 72 | `POST /platform.sync_revenuecat` | `product_ids` | `product_ids` |

### Customers (nested on billing attach / create)

| # | Source | Field | Key |
|---|---|---|---|
| 73 | `customer_data` / `CustomerDataSchema` on attach | `auto_enable_plan_id` | `auto_enable_plan_id` |
| 74 | `updateCustomerParams` (if used on public API) | `auto_enable_plan_id` | `auto_enable_plan_id` |

### Invoices (RPC)

| # | Route | Field | Key |
|---|---|---|---|
| 75 | invoice insert RPC | `plan_ids` | `plan_ids` |

---

## Vercel webhooks (`planAliasMiddleware` on `/:orgId/:env/*`)

| # | Route / handler | Field | Key |
|---|---|---|---|
| 76 | PATCH installation `handleUpdateBillingPlan` | `billingPlanId` | `billingPlanId` |
| 77 | POST resource `handleCreateResource` | `billingPlanId` | `billingPlanId` |
| 78 | PATCH resource `handleUpdateResource` | `billingPlanId` | `billingPlanId` |
| 79 | Marketplace invoice handlers | `billingPlanId` in provisioning | set server-side from Stripe metadata |

Vercel `productId` path/body = marketplace resource id → **not** rewritten.

---

## Post-auth webhooks without middleware (manual or N/A)

| # | Source | Field | Rewrite |
|---|---|---|---|
| 80 | Stripe checkout completed | metadata `data.plan_id` / attach payload | **manual** `rewritePlanIdAliasValues` in `setupCheckoutSessionCompletedContext` |
| 81 | RevenueCat webhooks | `event.product_id` | **intentionally skipped** — RevenueCat store id, mapped via `revenuecat_mappings` |
| 82 | Stripe setup-payment deferred attach | metadata `plan_id` | flows through checkout metadata rewrite |
| 83 | Vercel marketplace POST `/:orgId/:env/*` | invoice payloads | no public plan id in request body |

---

## Intentional skips (not bugs)

| Item | Why |
|---|---|
| `x-client-type: dashboard` on `/v1` | Dashboard sends canonical ids |
| `internalRouter` (`/products`, RPC on internal) | Session auth; canonical ids |
| GET/HEAD request bodies | No body rewrite; path params still rewrite on mutating routes |
| Empty / missing `ctx.requestBody` | No-op; must not invent a body |
| `new_plan_id` | Rename **target**, not alias lookup |
| Create-plan identity: `plan_id`, `id`, `product_id` | Minting a plan may intentionally use an old alias string as the new id |
| `customer_id` path/body | Never a plan id |
| Stripe price ids, `internal_id`, `base_internal_product_id` | Not public plan ids |
| Vercel `productId` (marketplace) | Foreign namespace |
| RevenueCat `product_id` | Store sku, not Autumn plan id |
| Copy-product body `id` | New id in target environment |
| Query strings | No plan-id query params found in public API |

---

## Gaps fixed in this branch

| Field | Where | Fix |
|---|---|---|
| `base_variant_id` | `catalogV2` plan + `variants[]` pointer writes | Added to `PLAN_ID_ALIAS_REWRITE_KEYS` |

---

## Count summary

| Category | Count |
|---|---|
| Path-param ingress routes | **17** (middleware-covered) + **5** dashboard internal (skipped) |
| Body ingress endpoint groups (table rows 23–75) | **53** |
| Vercel body ingress | **3** |
| Webhook / manual | **4** |
| **Total mapped ingress sites** | **77** |

Each row is one transport surface (route family + field tree). Nested arrays/objects
dedupe to the schema field — one `plan_id` key covers `plans[]`, `phases[].plans[]`,
migration `plan_filter.$or[]`, etc., via recursive `rewritePlanIdAliasValues`.
