# computeEntitlementPricesPlan — mode × outcome case matrix

Claim = definition match only. A claim always means `same`; mismatches are leave + new.

## Modes

| Mode | Claim? | Leaving (unclaimed current) |
|---|---|---|
| `{ type: "update", protectReferencedRows: false }` | yes (definition match) | `deleted` |
| `{ type: "update", protectReferencedRows: true }` | yes (definition match) | `retired` |
| `{ type: "version" }` | no — all desired mint | ignored (old version untouched) |
| `{ type: "custom" }` | yes (definition match) | ignored (catalog kept) |

Create = `currentRows` omitted → every desired row is `new`. Not a mode.

## Claim outcomes × mode (EP + base lanes)

| Outcome | update (no protect) | update (protect) | version | custom |
|---|---|---|---|---|
| **claim** (definition match) | `same` | `same` | `new` (fresh ids; no claim) | `same` |
| **new** (no definition match) | `new` | `new` | `new` | `new` is_custom |
| **leaving** (unclaimed current) | `deleted` | `retired` | ignored | ignored |

EP claim uses `EntitlementPriceMatchPrecision.EntitlementAndPriceDefinition`. Base claim uses `pricesAreSame`.

## Cases to unit-test (minimum)

1. **Create** — no `currentRows`; one base + one free EP + one priced EP → all `new`
2. **Update no-op** — identical desired vs current → all `same` (ids kept; no churn)
3. **Update amount edit** — EP amount change → no claim → `deleted`+`new` (no protect) / `retired`+`new` (protect)
4. **Update remove feature** — current EP unclaimed → `deleted` / `retired`
5. **Update add feature** — desired with no match → `new`
6. **Update free→paid same feature** — definition mismatch → leave free + mint paid
7. **Update base amount** — no claim → leave + new
8. **Update remove base** — base `leaving`
9. **Version** — identical content → all desired `new` (fresh ids); current ignored (no deleted/retired)
10. **Custom exact** — catalog rows reused → `same`; no deleted
11. **Custom changed** → `new` with `is_custom`; catalog current ignored
12. **Stripe carry** — `new` prices receive stripe ids from matching current via `carryForwardStripeResources`
13. **Resulting content** — `basePriceAndEntitlementPrices` = new+updated+same for fullProduct

## Intentional non-goals in this suite

- `handleNewProductItems` adoption
- PATCH `add_items`/`remove_items`/`update_items` adapter
- Catalog execute consuming buckets
