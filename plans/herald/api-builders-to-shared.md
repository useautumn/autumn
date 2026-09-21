# Moving the API object builders into shared

Herald has to decide balance webhooks with prod's exact code. That code builds
an `ApiCustomer` / `ApiEntity` from a `FullSubject`, and the builders live in
`server/`, where herald cannot reach them.

## The pattern they join

Shared already holds the first generation of these builders, and the context
type they take:

```
shared/types/sharedContext.ts            org, env, features, logger, expand
shared/api/customers/cusFeatures/utils/  getApiBalance.ts, getApiBalances.ts
shared/api/customers/flags/utils/        getApiFlag.ts
```

The FullSubject generation moves in beside them: one builder per API object,
in that object's `utils/` folder, taking `SharedContext`. Every file is a pure
move: same name, same body, only import paths change. The server keeps a thin
caller wherever a database step has to be added.

```
shared/api/
  customers/cusFeatures/utils/   getApiBalanceV2, getApiBalancesV2, roundApiBalance   done
  customers/flags/utils/         getApiFlagV2                                          done
  products/utils/convert/        fullProductToApiPlan                                  done
    licenses/                    fullPlanLicenseToApiPlanLicense, fullPlanLicensesToApiPlanLicenses
    variants/                    fullProductToApiPlanVariant, apiPlanToVariantDetails
    types/                       apiPlanContext
  customers/cusPlans/utils/      getApiSubscriptionV2, getApiSubscriptionsV2           done
  licenses/utils/                getApiCustomerLicenses                                done
  customers/utils/               getApiCustomerBaseV2, getApiSubject, customerEntityData  done
  customers/cusProcessors/utils/ getCusProcessors                                      done
  entities/utils/                getApiEntityBaseV2                                    done
  customers/cusFeatures/utils/check/   buildEvaluationSubject, resolveCheckSpendLimits
```

The rule: a function that builds an API object lives in that object's folder under
`shared/api/`. Helpers over database rows (`is*`, `find*`, row conversions) stay under
`shared/utils/`, which is why `isTrialCardRequired` and `fullProductsToLicenseCustomize`
are there.

## Review of the refactor (2026-09-21)

How it was checked: (1) three independent code audits of every moved body, every caller, and every
place a new field could leave the server; (2) the OLD code run from a clean checkout of `848b0e5e5b`
in its own process, the NEW code in another, outputs dumped and compared field by field, telling
`null`, a missing key and an `undefined` key apart.

| Compared | Cases | Differences a client can see |
|---|---|---|
| real plans x 7 option sets (incl. empty / partial feature lists, EUR, server ctx) | 2,506 | 0 |
| real customers x 10 API versions x 2 expand sets | 2,800 | 0 |
| real entities x 10 API versions | 800 | 0 |
| synthetic plans: row defaults, prices, items, trials, license links, variants, RevenueCat, pairing edge cases | 1,458 | 54, all from the three causes below |

Local data has no trials, license links, variants, custom prices or cross-version prices, which is why
the synthetic matrix exists. Trials, licenses, variants and RevenueCat came out identical.

### Settled with John (2026-09-21)

1. **A FIXED price whose `entitlement_id` matches an entitlement now throws** (`TypeError` reading
   `config.usage_tiers.length`; old code never paired a fixed price, so it rendered). A fixed price is
   never meant to carry an `entitlement_id`, and no write path sets one; the case was built by hand for
   the matrix. No guard added. **Pre-merge data check, once, on prod:**
   `select count(*) from prices where config->>'type' = 'fixed' and entitlement_id is not null;`
   Anything above 0 means those plans would 500, so stop and decide then.
2. **A price and its entitlement on different product versions now pair** (the item gains a full `price`
   object where it used to show `price: null`). **Intended**: it is the recent pairing rule, where a price
   linked to an entitlement on another `internal_product_id` is fine and the same-product one is preferred.
   The refactor brings the plan response in line with it.
3. **`stripe_additional_ids` on `/v1/products/license_products` and `/v1/plans/license_products`.** Fine:
   those routes serve the dashboard only.

### Known and harmless

- `archived` null/undefined and `version` undefined: old threw a schema error (500), new renders the
  default. Both columns are NOT NULL, so unreachable.
- A price whose `entitlement_id` is null and an entitlement whose `id` is undefined: old paired them
  (loose `==`), new does not. Ids are always minted strings.
- `price.interval_count`: old left the key present as `undefined`, new omits it. Invisible in JSON; every
  in-process consumer compares by value.
- The 15 `shared` test files that fail to load (`Cannot access 'ApiFreeTrialSchema' before
  initialization`) fail identically on `848b0e5e5b`: 351 pass / 15 fail before and after.

## BEFORE MERGING INTO dev: port every renderer change dev made in the meantime

**Non-negotiable.** These functions build the JSON customers parse. This branch MOVED and
REWROTE them, so a change someone lands on dev in the OLD location will not conflict
cleanly: git sees "modified on dev, deleted here", and the easy resolution (keep the
deletion) silently throws their change away.

This branch's copy of the old files is the state at commit `848b0e5e5b` (the clone is
shallow, so `git merge-base` finds nothing; compare trees directly).

### Procedure, every time dev is merged or rebased in, and once more right before the PR merges

1. `git fetch origin dev`
2. For every OLD path below, diff this branch's pre-refactor copy against dev:
   ```sh
   while read -r path; do
     git diff 848b0e5e5b origin/dev --stat -- "$path" | tail -1 | sed "s#^#$path :: #"
   done < plans/herald/renderer-old-paths.txt
   ```
3. Any line of output is a change on dev that has to be PORTED BY HAND into the new home
   (table below). Read the dev commit (`git log 848b0e5e5b..origin/dev -- <path>`) for its intent.
4. Port it, add or adjust a case in the matching test suite, re-run the suites, and re-run the
   old-vs-new comparison against real data with dev's version as "old".
5. Also grep dev for NEW callers of the old names (`getPlanResponse` args, `toApiPlanLicenses`,
   `buildApiPlanLicense`, `licensePlanCustomize`, `resolveTrialCardRequired`, `getCusProcessors`,
   `subjectWithoutEntityData`, ...): a new caller written against the old signature compiles
   against nothing after the merge.

### Where each old file's logic lives now

| Old path (server/src/internal/...) | New home |
|---|---|
| `products/productUtils/productResponseUtils/getPlanResponse.ts` (the rendering) | `shared/api/products/utils/convert/fullProductToApiPlan.ts` + `shared/utils/productV2Utils/productV2ToApiPlanV1.ts` + `mapToProductV2.ts`; the server file keeps only the two DB reads |
| `.../buildApiPlanLicense.ts` | `shared/api/products/utils/convert/licenses/fullPlanLicenseToApiPlanLicense.ts` |
| `.../buildApiPlanVariant.ts` | `.../convert/variants/fullProductToApiPlanVariant.ts` |
| `.../buildVariantDetails.ts` | `.../convert/variants/apiPlanToVariantDetails.ts` (diff) + `getPlanResponse.ts` (DB fetch) |
| `.../resolveTrialCardRequired.ts` | `shared/utils/productUtils/classifyProduct/isTrialCardRequired.ts` |
| `licenses/licenseLinkCustomize.ts` | `shared/utils/planV1Utils/licenses/fullProductsToLicenseCustomize.ts` |
| `licenses/licenseUtils.ts` (`toApiPlanLicenses` only) | `.../convert/licenses/fullPlanLicensesToApiPlanLicenses.ts` |
| `customers/cusUtils/getApiCustomerV2/getApiBalance/*` | `shared/api/customers/cusFeatures/utils/`, `shared/api/customers/flags/utils/getApiFlagV2.ts` |
| `customers/cusUtils/getApiCustomerV2/getApiSubscription/*` | `shared/api/customers/cusPlans/utils/` |
| `customers/cusUtils/getApiCustomerV2/getApiCustomerLicense/*` | `shared/api/licenses/utils/` |
| `customers/cusUtils/getApiCustomerV2/getApiCustomerBaseV2.ts`, `getApiSubject.ts` | `shared/api/customers/utils/` (invoices are now rendered in `getApiCustomerV2.ts` and handed in) |
| `customers/cusUtils/customerEntityData.ts` | `shared/api/customers/utils/customerEntityData.ts` |
| `customers/cusUtils/cusResponseUtils/getCusProcessors.ts` | `shared/api/customers/cusProcessors/utils/` |
| `customers/cache/fullSubject/roundCacheBalance.ts` (`roundCacheBalance` only) | `shared/utils/common/mathUtils.ts` |
| `entities/entityUtils/getApiEntityV2/getApiEntityBaseV2.ts` | `shared/api/entities/utils/` |

### Already known: dev changed the plan renderer after this branch forked

Checked 2026-09-21 against `origin/dev` at `10462e7fff`. Four old paths already differ:

| File | What dev did | What it means here |
|---|---|---|
| `getPlanResponse.ts` | `a873eaa192` removed `planItems.map(item => ({ ...item, proration: undefined }))` | On dev, plan items now CARRY `proration`. This branch still strips it. **dev wins.** |
| `shared/utils/productV2Utils/productV2ToApiPlanV1.ts` | same commit removed the `includeProration` param and the stripping | Drop `includeProration` here too, and its two uses: `fullProductsToLicenseCustomize.ts`, and the server callers that pass it. |
| `licenses/licenseLinkCustomize.ts` | stopped passing `includeProration: true` | follows from the above |
| `getApiBalance/getApiBalanceV2.ts` | types only: dev still has `FullSubject` / `FullCusEntWithFullCusProduct`; this branch narrowed them to view types | no output change; keep this branch's narrower types (the balance worker needs them) |

To do when porting: delete the "proration is internal and never on an item" case in
`server/tests/unit/products/get-plan-response-coverage.test.ts` and replace it with dev's behaviour.

## What stays in the server

| Stays | Why |
|---|---|
| `buildCustomerEligibility` | reads the trial fingerprint from Postgres |
| `buildVariantDetails` | loads a variant's base product from Postgres |
| `getPlanResponse` | becomes `getApiPlan` + those two steps |
| the `*Expand*` builders | load entities, invoices, rewards |
| `invoicesToResponse`, `processInvoice` | an invoice's hosted URL is built from `AUTUMN_API_URL`, a server env var; `customers.get` renders invoices and hands them to `getApiCustomerBaseV2` |

Neither database step runs when a customer is built: that path passes no `ctx`
to `getPlanResponse` (`getApiSubscriptionV2.ts:107`).

## Small functions that move out of heavy files

| Function | From | Why it is safe |
|---|---|---|
| `invoicesToResponse`, `processInvoice` | `invoices/invoiceUtils.ts` | field mapping only |
| `toApiPlanLicenses`, `licensePlanCustomize` | `licenses/licenseUtils.ts`, `licenseLinkCustomize.ts` | reads the product rows it is given |
| `mapToProductItems` | `products/productV2Utils.ts` | shared helpers + two price/entitlement lookups |
| `roundCacheBalance`, `getCusProcessors`, `customerEntityData` | one file each | no imports outside shared |

## Slices

Each slice is reviewable alone and leaves the server's output identical.
Check after each: `bun ts` in `server/` and `shared/`, then the named tests.

| # | Slice | Check |
|---|---|---|
| 1 | balances + flags (5 files, `roundCacheBalance`) | `balances/check/basic`, one `customers.get` test |
| 2 | plan core: `getApiPlan`, `mapToProductItems`, license helpers | `products` get/list tests |
| 3 | subscriptions + customer licenses | `customers.get` with `subscriptions.plan` expand |
| 4 | customer, entity, `getApiSubject`, invoices mapper, processors | `customers.get`, `entities.get` |
| 5 | evaluation subject + `resolveCheckSpendLimits` | `balances/check` spend-limit tests |

After slice 5 nothing under the webhook decisions imports from `server/` except
`sendSvixEvent`, and the webhooks package (see `units.md`, unit 5) can start.
