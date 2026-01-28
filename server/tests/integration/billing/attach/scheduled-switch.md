# scheduled-switch/ Test Cases

Covers **downgrades** — when attaching a lower-tier product that takes effect at **end of billing cycle**.

---

## scheduled-switch-basic.test.ts

Basic downgrade scenarios.

- **scheduled-switch: pro to free** — Pro → Free. Verify pro is "canceling" (active with canceled_at), free is "scheduled". At cycle end, pro removed, free active.
- **scheduled-switch: premium to pro** — Premium ($50/mo) → Pro ($20/mo). Verify premium canceling, pro scheduled. At cycle end, premium removed, pro active.
- **scheduled-switch: premium to pro to free** — Premium → Pro (scheduled) → Free (scheduled). Verify pro scheduled is replaced by free scheduled. At cycle end, premium removed, free active.
- **scheduled-switch: premium to free to pro** — Premium → Free (scheduled) → Pro (upgrade, immediate). Verify scheduled downgrade cancelled, pro active immediately.
- **scheduled-switch: premium to pro, then upgrade to growth** — Premium → Pro (scheduled) → Growth (immediate). Verify scheduled pro is cancelled, growth active.
- **scheduled-switch: premium to free, then upgrade to pro** — Premium → Free (scheduled) → Pro (immediate). Verify scheduled free is cancelled, pro active.
- **scheduled-switch: premium annual + monthly to premium monthly** — Premium with annual + monthly components → Premium monthly only. Verify correct handling of mixed intervals on downgrade.

---

## scheduled-switch-prepaid.test.ts

Downgrades with prepaid quantities.

> **Key behavior:** Total prepaid quantity is preserved (rounded to new billing units).
> Example: 5 packs × 100 units = 500 units → new plan with 50 units/pack = 10 packs.

### Quantity handling
- **scheduled-switch: prepaid 5 packs to 2 packs (explicit options)** — Premium 5 packs (100 units/pack) → Pro 2 packs. Verify 2 packs on next cycle.
- **scheduled-switch: prepaid, no options passed in** — Premium 5 packs → Pro (no options). Verify total units preserved, quantity converted to new billing units.
- **scheduled-switch: prepaid, no options, different billing units** — Premium 5 packs (100 units/pack = 500 units) → Pro (50 units/pack). Verify 10 packs on next cycle.
- **scheduled-switch: prepaid to quantity 0** — Premium 5 packs → Pro with quantity: 0. Verify no prepaid charged on next cycle.

### Feature changes
- **scheduled-switch: prepaid to product without prepaid feature** — Premium with prepaid → Free (no prepaid). Verify balance lost at cycle end.
- **scheduled-switch: prepaid with different price per pack** — Premium ($15/pack) → Pro ($10/pack). Verify next cycle uses new price.

### Included usage change
- **scheduled-switch: prepaid included usage increase** — Premium prepaid (0 included) → Pro prepaid (100 included). Verify included usage changes on next cycle.
- **scheduled-switch: prepaid included usage decrease** — Premium prepaid (100 included) → Pro prepaid (0 included). Verify included usage changes on next cycle.

---

## scheduled-switch-consumable.test.ts

Downgrades with consumable features.

> **Note:** Consumable overage is charged at cycle end via invoice-created webhook. These tests verify the downgrade flow works correctly with consumable usage.

- **scheduled-switch: pro with consumable, usage under limit, to free** — Pro with consumable (used 50/100 included) → Free. Verify scheduled downgrade, no overage charged at cycle end.
- **scheduled-switch: pro with consumable, into overage, to free** — Pro with consumable (used 150/100, 50 overage) → Free. Verify overage charged at cycle end when downgrade completes.
- **scheduled-switch: premium with consumable overage, downgrade to pro** — Premium ($50/mo) with consumable (200 used, 100 overage) → Pro ($20/mo). Advance cycle. Verify overage billed to Premium, Pro active with balance reset. (from invoice-created-consumable-edge-cases.test.ts)

---

## scheduled-switch-allocated.test.ts

Downgrades with allocated (seat-based) features.

> **Note:** These cases have undefined behavior. Tests should throw error "behavior undefined" until we clarify how allocated seats are handled on scheduled downgrade.

- **scheduled-switch: pro with allocated, under limit, to free** — Pro with 5 allocated (using 3) → Free. Error: "behavior undefined". TBD: How are seats handled at cycle end?
- **scheduled-switch: pro with allocated, over limit, to free** — Pro with 5 allocated (using 7) → Free. Error: "behavior undefined". TBD: How is existing overage handled on downgrade?

---

## scheduled-switch-entities.test.ts

Multi-entity downgrade scenarios.

### Basic entity downgrades
- **scheduled-switch: entity 1 pro, entity 2 pro, downgrade entity 1 to free** — Both on pro, downgrade one. Verify entity 1 has pro canceling + free scheduled, entity 2 unchanged.
- **scheduled-switch: entity 1 pro, entity 2 pro, downgrade both to free** — Both on pro, downgrade both. Verify both have free scheduled. Advance cycle, verify both on free.

### Downgrade + upgrade on different entities simultaneously
- **scheduled-switch: entity 1 premium to pro, entity 2 pro to premium** — Premium on entity 1 → Pro (scheduled), Pro on entity 2 → Premium (immediate). Verify independent states.
- **scheduled-switch: entity 1 pro to premium, entity 2 premium to pro** — Pro on entity 1 → Premium (immediate), Premium on entity 2 → Pro (scheduled). Verify independent states.

### Change scheduled product (replace)
- **scheduled-switch: entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro** — Premium on both → Free scheduled on both → Entity 2 changes scheduled to pro. Verify entity 1 has free scheduled, entity 2 has pro scheduled.

### Post-cycle upgrade
- **scheduled-switch: entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium** — After downgrade completes (entity 1 now free, entity 2 now pro), upgrade entity 1 back to premium.
- **scheduled-switch: entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium** — After monthly downgrade completes (entity 2 now pro), upgrade entity 2 back to premium. Entity 1 still has annual + scheduled pro.

### Chained downgrades
- **scheduled-switch: entity 1 premium, entity 2 premium, downgrade both to pro, then downgrade entity 1 to free** — Premium on both → Pro scheduled on both → Free scheduled on entity 1 (replaces pro). Verify entity 1 has free scheduled, entity 2 has pro scheduled.

---

## scheduled-switch-multi-interval.test.ts

Mixed billing interval scenarios (annual + monthly entities).

- **scheduled-switch: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance monthly cycle** — Annual on entity 1, monthly on entity 2 → both scheduled for pro. Advance 1 month. Entity 1 still on premiumAnnual + pro scheduled (annual not ended), entity 2 now on pro.
- **scheduled-switch: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, re-upgrade both** — Annual on entity 1, monthly on entity 2 → both scheduled for pro → both re-upgrade (premiumAnnual and premium). Verify scheduled downgrades cancelled, both back to original products.
- **scheduled-switch: entity 1 premiumAnnual, entity 2 premium, downgrade both to pro, advance full year** — Same setup but advance a full year to see the annual downgrade complete as well. Verify both entities now on pro.

---

## scheduled-switch-edge-cases.test.ts

Edge cases and complex scenarios.

- **scheduled-switch: multiple scheduled changes on same entity** — Growth → Free (scheduled) → Pro (replaces) → Premium (replaces) → Free (replaces). Verify each change replaces the previous scheduled product.

---

## Summary

| File | Test Count |
|------|------------|
| `scheduled-switch-basic.test.ts` | 7 |
| `scheduled-switch-prepaid.test.ts` | 8 |
| `scheduled-switch-consumable.test.ts` | 3 |
| `scheduled-switch-allocated.test.ts` | 2 |
| `scheduled-switch-entities.test.ts` | 8 |
| `scheduled-switch-multi-interval.test.ts` | 3 |
| `scheduled-switch-edge-cases.test.ts` | 1 |
| **Total** | **32** |
