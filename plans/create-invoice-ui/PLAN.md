# invoices.create — Dashboard UI Plan

Full builder for `POST /v1/invoices.create` (PR #3475), mounted on the customer page
invoices table. Scope: plans, feature quantities, licenses, customize, discounts,
proration, custom line items, live preview.

## Contract source of truth

`shared/api/others/apiInvoice/createInvoiceParams.ts` — **not** the PRD JSON examples.
The PRD is a design transcript; later bullets overrule its earlier examples:

| PRD example | Corrected by | Shipped |
| --- | --- | --- |
| `metered_quantities` | bullet 254 | `usage` |
| `prorate_from` | bullet 316 | `period_start` / `period_end` |
| `interval` on feature_quantities | — | absent |

`CreateInvoiceParamsSchema` is `.strict()` — any unknown key is a 400.

## Reuse inventory (verified present)

| Asset | Path | Use |
| --- | --- | --- |
| `PlanPrepaidQuantityFields` | `forms/shared/` | quantity rows (render-prop) |
| `PreviewSection` | `forms/shared/` | preview + totals |
| `PreviewErrorDisplay` | `forms/shared/` | 400 surfacing |
| `discount-row/` | `forms/shared/` | discount editor |
| `SelectedPlanRow`, `PlanItemsSection` | `forms/shared/` | plan rows |
| `InvoiceSettingsSection` | `forms/shared/` | net terms / template |
| `useBillingPreview` | `forms/shared/hooks/` | debounced preview |
| `useAppForm` kit | `hooks/form/form.ts` | QuantityField, NumberField, TextField, SelectField |
| `toApiDiscounts`, `filterValidDiscounts` | `attach-v2/utils/discountUtils` | `FormDiscount = AttachDiscount & {_id}` — identical type |
| `convertPrepaidOptionsToFeatureOptions` | `utils/billing/prepaidQuantityUtils` | needs `billing_behavior` (see Step 1c) |
| `convertLicenseQuantitiesToParams` | `utils/billing/licenseQuantityUtils` | emits `{license_plan_id, quantity}` |
| `prepaidTierStops`, `PrepaidQuantityControl` | shared | tier stops / stepper |
| `PREVIEW_REVEAL_TRANSITION`, `STAGGER_*` | shared / attach-v2 | motion constants |

`AttachPlanPrepaidQuantityFields` is a 38-line field-name adapter over the shared
component. The create equivalent is the same size. That is the DRY template.

---

## Step 1 — Shared extensions (touches existing files; review alone)

Three gaps where reuse is not free. All are additive with defaults, so every existing
caller is unchanged.

**1a. `useBillingPreview` — parameterize `expand`.**
`forms/shared/hooks/useBillingPreview.ts` hardcodes `BILLING_PREVIEW_EXPAND` into every
request body. `CreateInvoiceParamsSchema` is `.strict()` → **guaranteed 400**.
Add `expand?: readonly string[]` defaulting to the existing constant; omit the key when
an empty array is passed.

**1b. `PlanPrepaidQuantityFields` — allow usage-based rows.**
Currently filters `item.usage_model !== UsageModel.Prepaid`. `invoices.create` bills
prepaid *and* usage-based. Add `usageModels?: UsageModel[]` defaulting to `[Prepaid]`.

**1c. Quantity converters — carry `billing_behavior`.**
`InvoiceFeatureQuantitySchema` requires `billing_behavior` and optionally takes
`usage` / `prorate`; the existing converters emit only `{feature_id, quantity}`.
Write `convertToInvoiceFeatureQuantities` in a **new** `utils/billing/invoiceQuantityUtils.ts`
rather than widening the attach converter — different output type, different required
fields. Do not fork the prepaid stepper logic; reuse `prepaidTierStops`.

Verify: `cd server && bun ts` is unaffected; `vite` typecheck clean; existing attach
and subscription-update previews still send `expand`.

## Step 2 — Schema, form, request mapper (the part most likely to be wrong)

- `createInvoiceFormSchema.ts` — mirror `CreateInvoiceParamsSchema` field-for-field.
  Reuse `FormDiscount` and `FormCustomLineItem` (already exported from attach).
- `hooks/useCreateInvoiceForm.ts` — `useAppForm` + defaults, mirroring `useAttachForm`.
- `hooks/useCreateInvoiceRequestBody.ts` — **pure exported function**
  `buildCreateInvoiceRequestBody(...)` + thin `useMemo` hook, exactly as
  `buildAttachRequestBody` is structured. Pure so it is unit-testable without React.

Unit-test the mapper (the tier/billing-unit math is where bugs hide):
`createInvoiceRequestBody.test.ts`, mirroring `attachFormOverridesFromRequestBody.test.ts`.

## Step 3 — Preview hook + section

- `hooks/useCreateInvoicePreview.ts` — wraps `useBillingPreview` with
  `path: "/v1/invoices.create"`, `preview: true`, `expand: []`.
- Map `lines` → `line_items` **here, at the edge**. `CreateInvoicePreviewSchema` returns
  `lines` with `amount_after_discounts` / `prorated`; `PreviewSection`'s `PreviewData`
  expects `line_items`. Adapt in the hook; do not widen the shared type.
- `CreateInvoicePreviewSection.tsx` wraps `PreviewSection`.

**Design centerpiece.** PRD bullets 248–250: quantities are billable units *exclusive of
included usage*, then Autumn applies billing-unit rounding and tiers; bullets 288–294 warn
Stripe price mappings carry their own included tiers. The operator cannot predict the
amount from the number typed. So:

- preview lives **beside** the form permanently, not behind a Review step
- each line shows its derivation (`12500 units → 12.5 packs → tier1 ×10 + tier2 ×8`)

## Step 4 — Sections

One file each, wrapping the shared component:

| File | Wraps | Notes |
| --- | --- | --- |
| `CreateInvoicePlansSection` | `SelectedPlanRow` | multi-plan; `plan_id` selects variants |
| `CreateInvoiceQuantityFields` | `PlanPrepaidQuantityFields` | ~38-line adapter |
| `CreateInvoiceLicensesSection` | — | label **billable seats** (PRD 273/277) |
| `CreateInvoiceCustomLinesSection` | — | description + amount; never prorated |
| `CreateInvoiceDiscountsSection` | `discount-row` | guard PRD 310 (below) |
| `CreateInvoiceTermsSection` | `InvoiceSettingsSection` | net terms, template, period, tax rate |
| `CreateInvoiceFooter` | `BillingFooter` | confirm weight |

Customize (`customize.price`, `customize.items`) reuses `InlinePlanEditor`.

### PRD-unresolved decisions, resolved here

- **277** license quantities pooled vs per-seat → label **billable seats**, matching
  shipped `license_quantities.quantity` and PRD bullet 273.
- **310** fixed-amount discount spanning lines → shipped code **refuses** it. Guard
  client-side (disabled submit + reason) so no raw 400 reaches the operator.
- **323** proration defaults → mirror shipped: on for base/seats, off for usage, never
  custom lines. Surface per item; make clear `prorate: false` means *charge full*, not *skip*.
- **264** tier restart across repeated `usage` entries → group by `feature_id` in one
  request; state it in the derivation line so the behavior is visible.

## Step 5 — Sheet + trigger + registry

- `views/customers2/components/sheets/CreateInvoiceSheet.tsx` — `SheetHeader` /
  `SheetSection` / `SheetFooter`, `LayoutGroup`, mirroring `ReissueInvoiceSheet`.
- `table/customer-invoices/CreateInvoiceTrigger.tsx` — mirrors `AttachProductSheetTrigger`.
- `hooks/stores/useSheetStore.ts` — add `"create-invoice"` to `SheetType` (1 line).
- `customer/CustomerSheets.tsx` — one `case` (1 line).

## Motion (Emil)

Occasional, deliberate operator task → standard animation, no delight.

- Reuse `PREVIEW_REVEAL_TRANSITION` (0.25s, `[0.32,0.72,0,1]`) and `STAGGER_CONTAINER` /
  `STAGGER_ITEM`. Do not invent curves.
- **Totals never tween their digits.** A number slot-machining while someone decides
  whether to bill $4,318 reads as uncertainty. Fade the row; swap the value.
- ≤250ms, `ease-out`, `scale(0.97)` on submit press.
- Submit is irreversible (only `void` from #3468 undoes it) → `VoidInvoiceDialog`-level
  confirm; success links to the created invoice.

## Build status (implemented)

All five steps landed. Extra DRY win beyond the plan: the custom-line-item editor was
inlined in `AttachAdvancedSection`; it is now `forms/shared/CustomLineItemRows.tsx`
(component + pure list helpers), consumed by attach and create. 63 duplicated lines
removed from attach.

**Verification caveat — `bun ts` in vite is a no-op.** `vite/tsconfig.json` has
`"files": []` with project references, so `tsc --noEmit` checks nothing and always
reports success. Use `npx tsc -p tsconfig.app.json --noEmit` instead, and compare
against the baseline: ~1189 `../shared/**` alias errors and 260 `src/` errors are
pre-existing under that config. After this work `src/` is **257** (three pre-existing
errors removed by the extraction), with zero in any touched file.

## Verification reality

- `cd server && bun ts` after any shared-type touch; vite typecheck; pinned Biome on
  touched files only (never repo-wide).
- Unit-test the mapper (Step 2) — no Stripe needed.
- **End-to-end is not verifiable here**: needs a dev stack + Stripe. Treat first run as
  unverified until clicked through.
- All three PRs (#3468/#3469/#3475) have **zero human review** — cubic bot only, and
  #3475 already diverges from its own PRD. The contract may move under this UI.
