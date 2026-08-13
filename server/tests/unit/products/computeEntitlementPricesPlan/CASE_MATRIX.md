# computeEntitlementPricesPlan — mode × outcome case matrix

Input is CustomizePlanV1 items/price slice (`customize`): PUT (`items`) and/or PATCH (`price`; future `add_items`/`remove_items`). Omitted lanes carry current → claim `same`.

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

1. **Create PUT** — `price` + `items`; no `currentRows` → all `new`
2. **Update no-op PUT** — identical → all `same`
3. **PUT amount edit** — EP amount change → `deleted`+`new` / `retired`+`new`
4. **PUT remove feature** — `items: []` → leave
5. **PUT add feature** → `new`
6. **PUT free→paid** → leave free + mint paid
7. **PATCH base amount** — `price` only → leave + new; features `same`
8. **PATCH remove base** — `price: null` → base leave; features untouched when items omitted
9. **Version** — all desired `new`; current ignored
10. **Custom exact / changed** — `same` / `new` is_custom
11. **PUT items only** — base `same`
12. **Create price-only / items-only**
13. **`add_items`** → not-implemented error (extension point)
14. **projected** — new+updated+same

## Intentional non-goals in this suite

- `handleNewProductItems` adoption
- Implementing `add_items` / `remove_items` expand
- Catalog execute consuming buckets
