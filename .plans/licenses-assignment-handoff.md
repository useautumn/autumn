# Licenses — handoff into the `licenses-assignment` stack

State dump as of branch `john/licenses-assignment` (stacked on
`john/license-prepaid-quantities` @ `942c45bdb`, which sits on
`john/license-attach` → `john/license-descope` → `dev`). Everything below is
committed; the working tree is clean.

## 1. The domain in one paragraph

A **plan license** (`plan_licenses`, hydrated as `FullPlanLicense`) is a link
on a parent plan saying "this plan grants N included seats of license product
X". When a customer attaches the parent plan, a **customer license** pool row
(`customer_licenses`) is planted under the parent customer product. Entities
consume seats from the pool via **assignments** — each assignment is itself a
`customer_products` row (entity-scoped, `license_parent_customer_product_id`
set) carrying its own `customer_prices` snapshot. Seats beyond the included
amount are **paid** (`paid_quantity`); paid-but-unassigned capacity is the
**unused prepaid buffer**.

## 2. The link_id architecture (the load-bearing decision)

Replaced the old "pool rows survive plan transitions and get reparented"
model. Now:

- `customer_licenses.link_id` is a **minted stable logical identity**
  (`generateId("cus_lic_link")`), copied to every successor row. Minted at
  first creation only; **never derived** (two plans granting the same license
  product need distinct pools).
- Seats anchor via `customer_products.customer_license_link_id` and are
  **NEVER repointed** across plan transitions (1M-seat invariant). All seat
  indexes + the unique active-assignment-per-entity guard key on the link.
- Customer license rows are now **normal children of their customer
  product**: planted by `initCustomerLicenses` at init, die with the parent.
  Pre/post billing state = which customer product object you hold (outgoing
  from DB = persisted; incoming in-memory = planted+applied). This aligns
  licenses with how customer_prices already work everywhere.
- A **transition** (plan switch) = the planted successor row *adopts* the
  outgoing pool's link + carried counters. `CustomerLicenseTransition` =
  `{ outgoingCustomerLicense, incomingCustomerLicense, updates: { linkId,
  granted, remaining, paidQuantity }, priceTransitions,
  entitlementTransitions }` (`shared/models/billingModels/plan/customerLicensePlan.ts`).
- `computeCustomerLicenseTransitions` **always applies** at the end
  (`applyCustomerLicenseTransitions`) — successor rows are in-memory planted
  state and every downstream compute expects them converged. Apply does two
  things: stamps link/counters onto the incoming products' license rows
  (matched by `incomingCustomerLicense.id`), and **appends transitioned
  copies of the seat billing rows** into
  `billingContext.customerLicenseBillingContext` re-attributed to the
  incoming license id with prices mapped through `priceTransitions`
  (unmatched = customized seats flow through untouched — mirrors the future
  executor's bulk repoint). Outgoing rows stay pristine for refunds.
- Migration: single `shared/drizzle/0047_many_fallen_one.sql` (link columns,
  re-keyed indexes, drops `customer_products.customer_license_id`).
  **NOT yet applied** — John runs `bun db migrate` himself.

## 3. Billing context + line items (unit 7, done)

- `setupCustomerLicenseBillingContext({ctx, fullCustomer})` →
  `BillingContext.customerLicenseBillingContext = { licenseBillingPriceRows }`.
  Rows come from `customerLicenseRepo.listBillingPriceRows`: one hash-agg SQL
  pass grouping live seats by `(customer_license_link_id, price)`, excluding
  the earliest `included` free seats per link via VALUES + LATERAL top-N.
  Never enumerates seats. Attribution back to rows via in-memory link map.
  `LicenseBillingPriceRow = { customerProductId, price, quantity, source: {
  type: "customer_license_seat" | "customer_license_unused_prepaid",
  customerLicenseId } }`.
- **Only wired into attach** (`setupAttachBillingContext`). Not in
  updateSubscription / createSchedule / sync — see §6 trap.
- `customerLicenseToLineItems({ctx, billingContext, customerProduct,
  customerLicense, direction})` (utils/lineItems/) — context seat rows keyed
  to THIS row's id + `customerLicenseToUnusedPrepaidRows` (single fixed
  price; license plans have exactly one fixed price for now), each through
  `licenseBillingRowToLineItem` (fixedPriceToLineItem, in_advance,
  `getLineItemBillingPeriod`; `buildLineItem` flips sign on refund).
- Hooked per-product inside `customerProductToLineItems` (both directions) —
  so `buildAutumnLineItems` needs no special license wiring. Cases fall out:
  plain attach = buffer charge only; cancel = refund seats+buffer; transition
  = refund outgoing persisted, charge incoming applied.
- `getRefundLineItems` always appends catalog-synthesized license credits so
  the stored-line-item early-return can't swallow them.
  **Stored-line-item credit attribution for licenses was descoped** —
  license refunds are catalog-prorated, not actual-charged-amount credits.

## 4. license_quantities param → paid_quantity (done)

- API: `license_quantities: [{ license_plan_id, quantity }]`
  (`LicenseQuantityParamsSchema`, shared/api/billing/common/licenseQuantityParams.ts;
  on both AttachParamsV0 ext + V1; V1.2 change mapper passes through via
  `...input`). `quantity` = **total** seats inclusive of included.
- `setupCustomerLicenseQuantityContext` (dumb param read) →
  `BillingContext.customerLicenseQuantities: CustomerLicenseQuantity[]`
  (`{ licensePlanId, totalQuantity }`, shared/models/billingModels/customerLicenseQuantity.ts)
  → `InitFullCustomerProductContext` → `initCustomerLicenses` does
  `paid = max(0, totalQuantity − link.included)`, `granted = included + paid`,
  matched by `link.product.id === licensePlanId`. Rows plant when
  `granted > 0` (so prepaid-only links with included 0 now plant).
- Unknown `license_plan_id` in params is **silently ignored** — validation
  deliberately deferred.

## 5. Stripe subscription state (done, attach-scoped)

- `licenseBillingRowToStripeItemSpec` (stripeItemSpec/) → `{ stripePriceId,
  quantity, autumnPrice }`, throws when price lacks `stripe_price_id`.
- `customerLicenseToStripeItemSpecs` (subscriptionItems/) — same
  seat-rows+buffer recipe as line items.
- Hooked in `customerProductToStripeItemSpecs` (guarded on optional
  `billingContext`) → feeds ALL four surfaces at once: sub items update, sub
  create, schedule phases, checkout. Seat+buffer specs sharing a price merge
  in the existing per-priceId accumulators.
- `initStripeResourcesForBillingPlan` now appends license child products
  (deduped `customer_licenses[].planLicense.product` from insert+existing
  products) to `targetProducts`. Passed **by reference** deliberately —
  `createStripePriceIFNotExist` stamps `config.stripe_price_id` on the shared
  price objects that buffer rows point at. Persisted seat rows are detached
  JSON copies from the DB query and rely on earlier initialization.

## 6. Known traps / open wrinkles (do not forget these)

1. **Stripe deletion-loop trap**: any flow that rebuilds sub items without
   `customerLicenseBillingContext` set up will produce no license specs → the
   removal diff strips seat items from the Stripe sub. Must wire
   `setupCustomerLicenseBillingContext` into updateSubscription /
   createSchedule / sync before license billing goes beyond attach.
2. **Included-delta wrinkle** (parked by John): transitioned seat billing
   rows keep quantities computed under the *outgoing* included count; if the
   incoming plan's included differs, the charge side is slightly off. The
   grouped rows can't attribute the delta to a price group (per-seat ordering
   was deliberately dropped).
3. **No transition executor yet (unit 6)**: `CustomerLicenseTransition`s ride
   the AutumnBillingPlan but nothing executes them in the DB. Needed:
   `INSERT successor (SELECT live counters FROM predecessor)` + expire
   predecessor in ONE transaction, plus seat customer_prices bulk repoint per
   priceTransitions. Until then dual live rows per link can transiently
   exist and license state doesn't converge on plan switches.
4. **Reparenting machinery is obsolete but still present (unit 5)**:
   `reparentCustomerLicenses/`, eviction dance, and the
   `setupReconcileContext` bridge (link-keyed seat counts → row-id map)
   should be deleted; reconcile's stranded case becomes counter-carry by
   link_id.
5. Checkout `filterStripeItemSpecsByLargestInterval` drops a monthly license
   item from an annual parent's checkout — pre-existing multi-interval
   limitation, accepted for now.
6. `isNoopTransition` drops same-state transitions; planted rows mint fresh
   links so real transitions are never noop — the guard is for idempotent
   re-runs.
7. Assignment (seat) customer_products DO carry `customer_prices` snapshots
   (the initOptions JSDoc claiming "prices are dropped" is stale/aspirational
   — only entitlement `usage_allowed` is affected).

## 7. Test + verification state

- `server/tests/integration/licenses/billing/attach/attach-license-quantity.test.ts`:
  pro plan (free, dashboard item) + dev-seat license (20/mo, included 2),
  attach with `license_quantities: [{license_plan_id: devSeat.id, quantity: 5}]`,
  expects ONE invoice at 60 and pool `{granted 5, paid_quantity 3, remaining 5}`.
  **Never executed** — John stopped the run; everything is `bun ts`-verified
  only. First run needs migration 0047 applied + dev server (worktree port
  12780 via `AUTUMN_TEST_BASE_URL` in server/.env.local) + `bun workers`.
- Likely first-run suspects: `insertNewCusProducts` persisting planted pools
  with paid_quantity; invoice total proration; stripe price init ordering.

## 8. Working agreements (John's process — follow these)

- **Discuss before implementing**; split work into small auditable units and
  get explicit go-ahead. Present designs, don't run ahead.
- Never commit unless explicitly asked (he reviews one uncommitted diff).
- Format ONLY exact touched files via `./node_modules/.bin/biome check
  --write <files>` (binary lives at repo ROOT node_modules); never
  `ultracite fix`. Then `cd server && bun ts`.
- John runs `bun db migrate` and (usually) integration tests himself.
- Naming is a first-class concern: explicit everywhere (customerLicense /
  planLicense / licenseBillingRow / customerLicenseLinkId; no abbreviations).
  Named-params objects for functions.
- No DB reads in compute functions; setup owns IO. No unbounded reads.
- Commits (when asked): `bunx git-cz --non-interactive --type=feat
  --scope=licenses --subject="..."` (plain `git cz` is not installed).

## 9. The next stack: `licenses-assignment`

John named this stack as "the next thing" but has NOT scoped it yet — ask him
before assuming. Plausible candidates given the state above: reworking the
`licenses.attach` assignment flow (`billing/v2/actions/attachLicense/`,
`executeLicenseOps` take/release by link) onto the link model end-to-end,
assignment-driven billing updates (assigning past included should grow the
sub / invoice via the same licenseBillingRows machinery), and possibly units
5/6. Get his priorities first.
