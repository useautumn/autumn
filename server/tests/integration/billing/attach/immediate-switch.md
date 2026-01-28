# immediate-switch/ Test Cases

Covers **upgrades** — when attaching a higher-tier product that takes effect **immediately**.

---

## immediate-switch-basic.test.ts

Basic upgrade scenarios.

- **immediate-switch: free to pro** — Free product → Pro. Verify pro is active, free is removed, invoice for pro base price.
- **immediate-switch: pro to premium** — Pro ($20/mo) → Premium ($50/mo). Verify prorated charge for price difference.
- **immediate-switch: pro to premium mid-cycle** — Attach pro, advance 15 days, upgrade to premium. Verify prorated charge.
- **immediate-switch: pro to free to premium** — Pro → Free (downgrade, scheduled) → Premium (upgrade). Verify scheduled downgrade is cancelled, premium is active immediately.
- **immediate-switch: premium to pro to ultra** — Premium → Pro (downgrade, scheduled) → Ultra. Verify scheduled downgrade is cancelled, ultra is active immediately.
- **immediate-switch: upgrade with consumable features, verify usage resets** — Pro with consumable + free consumable + prepaid consumable → Premium. Verify all **usage resets**.
- **immediate-switch: upgrade with allocated features, verify usage carries over** — Pro with free allocated + allocated + prepaid allocated → Premium. Verify all **usage carries over**.

Fixtures: `products.pro()`, `products.premium()`, `products.ultra()`, `products.base()`

---

## immediate-switch-consumable.test.ts

Upgrades involving consumable features.

- **immediate-switch: pro with consumable, track usage, to premium** — Pro with consumable messages, track some usage (and also into overage). Upgrade to premium. Verify overage NOT charged on upgrade (billed at cycle end), and **usage resets** after upgrade.

---

## immediate-switch-allocated.test.ts

Upgrades involving allocated (seat-based) features.

### Same included usage (pro → pro-variant)
- **immediate-switch: free with free allocated to pro with allocated** — Free with free allocated users → Pro with allocated users (same included). Verify usage carries over.
- **immediate-switch: pro with allocated, under limit, to pro-variant** — Pro with 3 allocated (using 2) → Pro-variant with 3 allocated. Verify no overage, usage carries over.
- **immediate-switch: pro with allocated, at limit, to pro-variant** — Pro with 3 allocated (using 3) → Pro-variant with 3 allocated. Verify usage carries over.

### Included usage changes (pro → premium with higher limit)
- **immediate-switch: pro with allocated, under limit, to premium with higher limit** — Pro with 3 allocated (using 2) → Premium with 5 allocated. Verify no overage charge, usage carries over.
- **immediate-switch: pro with allocated, over limit, to premium with higher limit** — Pro with 3 allocated (using 5) → Premium with 10 allocated. Verify existing overage handled, usage carries over.

### Replaceable (TBD)
- **immediate-switch: allocated with replaceable entities (track negative), upgrade** — Error: "behavior undefined". Will implement later.

---

## immediate-switch-prepaid.test.ts

Upgrades involving prepaid features.

### No options passed
- **immediate-switch: free to pro with prepaid, no options** — Free → Pro with prepaid, no options passed. Verify quantity defaults to 0, only base price charged.

### Same config (quantity change only)
- **immediate-switch: pro with prepaid, increase quantity** — Pro with prepaid messages (2 packs) → same product with 5 packs. Verify refund old + charge new.
- **immediate-switch: pro with prepaid, decrease quantity** — Pro with prepaid (5 packs) → same with 2 packs. Verify credit issued.

### Billing units change
- **immediate-switch: prepaid billing units change (100 → 50)** — Pro prepaid (100 units/pack) → Premium prepaid (50 units/pack). Verify correct recalculation.
- **immediate-switch: prepaid billing units change (50 → 100)** — Pro prepaid (50 units/pack) → Premium prepaid (100 units/pack). Verify correct recalculation.

### Price change
- **immediate-switch: prepaid price increase** — Pro prepaid ($10/pack) → Premium prepaid ($15/pack). Verify correct charge difference.
- **immediate-switch: prepaid price decrease** — Pro prepaid ($15/pack) → Premium prepaid ($10/pack). Verify credit issued.

### Included usage change
- **immediate-switch: prepaid included usage increase** — Pro prepaid (0 included) → Premium prepaid (100 included). Verify correct handling.
- **immediate-switch: prepaid included usage decrease** — Pro prepaid (100 included) → Premium prepaid (0 included). Verify correct handling.

### Upcoming quantity (proration None)
- **immediate-switch: prepaid with upcoming_quantity populated, upgrade** — Pro with prepaid, decrease quantity with proration `None` (sets `upcoming_quantity`), then upgrade to premium. Verify correct handling of pending quantity change.

---

## immediate-switch-billing-interval.test.ts

Upgrades involving billing interval changes.

- **immediate-switch: monthly to annual** — Pro monthly → Pro annual. Verify correct charge for annual.
- **immediate-switch: monthly to monthly + annual** — Pro monthly → Pro with both monthly and annual components.

---

## immediate-switch-entities.test.ts

Multi-entity upgrade scenarios.

### Basic entity upgrades
- **immediate-switch: entity 1 free, entity 2 free, upgrade entity 2 to pro** — Two entities on free, upgrade one to pro. Verify independent states.
- **immediate-switch: entity 1 pro, entity 2 free, upgrade entity 2 to pro** — Mixed entity states, upgrade the free one.
- **immediate-switch: entity 1 pro, entity 2 pro, upgrade entity 2 to premium** — Both on pro, upgrade one to premium.
- **immediate-switch: entity 1 pro, entity 2 pro, upgrade entity 2 to pro annual** — Both on pro monthly, upgrade one to annual.

### Upgrade with scheduled downgrade
- **immediate-switch: entity 1 premium, entity 2 premium, downgrade entity 1 to pro, then upgrade entity 1 to growth** — Premium on both, downgrade one (scheduled), then upgrade that same entity. Verify scheduled downgrade is cancelled, growth is active.
- **immediate-switch: entity 1 premium, entity 2 premium, downgrade both to pro, upgrade entity 2 to growth** — Both scheduled for downgrade, upgrade one. Verify one still scheduled, one upgraded.

### Upgrade when cancel is scheduled
- **immediate-switch: entity 1 pro, entity 2 pro, cancel entity 1 (to free), upgrade entity 1 to premium** — Pro on both, cancel one (scheduled to free), then upgrade that entity to premium. Verify cancel is overridden, premium is active.

### Track and upgrade
- **immediate-switch: entity 1 pro, entity 2 pro, track usage on both, advance 2 weeks, upgrade entity 1 to premium** — Both on pro with tracked usage, mid-cycle upgrade one. Verify correct invoice at end of cycle (entity 2 overage + base prices).

---

## Summary

| File | Test Count |
|------|------------|
| `immediate-switch-basic.test.ts` | 7 |
| `immediate-switch-consumable.test.ts` | 1 |
| `immediate-switch-allocated.test.ts` | 6 |
| `immediate-switch-prepaid.test.ts` | 10 |
| `immediate-switch-billing-interval.test.ts` | 2 |
| `immediate-switch-entities.test.ts` | 8 |
| **Total** | **34** |
