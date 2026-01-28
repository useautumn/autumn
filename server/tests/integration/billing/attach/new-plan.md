# new-plan/ Test Cases

Covers attaching products when customer has **no existing product** for that group.

---

## attach-free.test.ts

- **new-plan: attach free product** — Free product with monthly messages. Verify balance, usage, no invoice.
- **new-plan: attach free with multiple features** — Free with messages + words + dashboard + unlimited. Verify all features present with correct balances.

Fixtures: `items.monthlyMessages()`, `items.monthlyWords()`, `items.dashboard()`, `items.unlimitedMessages()`, `products.base()`

---

## attach-paid.test.ts

- **new-plan: attach pro with mixed features** — Pro ($20/mo) with consumable words + prepaid messages + allocated users. Verify invoice = base + prepaid, all features correct.
- **new-plan: attach pro with allocated, create entities** — Pro with allocated users (3 included). Create 5 user entities via track. Verify users usage = 5, overage invoice created.
- **new-plan: attach base with prepaid messages, no options** — Base product with prepaid messages, attach without passing `options`. Expect error: "behavior undefined".
- **new-plan: attach pro with prepaid messages, no options** — Pro with prepaid messages, attach without passing `options`. Expect error: "behavior undefined".
- **new-plan: attach pro with prepaid messages, quantity 0** — Pro with prepaid messages, pass `options` with `quantity: 0`. Verify no prepaid charged, only base price.

Fixtures: `items.consumableMessages()`, `items.prepaidMessages()`, `items.allocatedUsers()`, `products.pro()`, `products.base()`

---

## attach-one-time.test.ts

- **new-plan: attach one-time purchase** — One-time product with prepaid messages. Verify invoice, balance added, no recurring subscription.
- **new-plan: attach one-time purchase twice** — Attach same one-time product twice. Verify balance is cumulative (not replaced).
- **new-plan: attach pro then one-time as main** — Attach pro, then attach one-time **without** `isAddOn`. Should replace pro (user forgot to toggle).
- **new-plan: attach one-time with quantity=0 for one feature** — One-time with messages (qty=100) + words (qty=0). Verify messages added, words not charged.
- **new-plan: attach one-time as add-on to pro** — Attach pro, then attach one-time with `isAddOn: true`. Verify both products exist, balances combined.
- **new-plan: attach one-time with multiple features** — One-time with messages + words + storage (all one-off). Verify all balances correct.
- **new-plan: attach one-time to entity** — Create entity, attach one-time to entity. Verify entity has balance, customer does not.

Fixtures: `items.oneOffMessages()`, `items.oneOffPrice()`, `products.oneOff()`

---

## attach-entities.test.ts

- **new-plan: create entity, attach pro to entity** — Create entity, attach pro to entity (not customer). Verify entity has product, customer does not.
- **new-plan: create 2 entities, attach pro to each** — Create 2 entities, attach pro to each. Verify independent balances, 2 separate subscriptions.
- **new-plan: attach pro to entity 1, advance 2 weeks, attach pro to entity 2** — Mid-cycle attach to second entity. Verify prorated billing for entity 2.
- **new-plan: attach pro annual to entity** — Attach annual product to entity. Verify correct billing interval.
- **new-plan: attach pro to customer, then pro to entity** — Attach pro to customer first, then attach pro to entity. Verify both have product independently.
- **new-plan: attach free to customer, then free to entity** — Attach free to customer first, then attach free to entity. Verify both have product independently.

Fixtures: `s.entities({ count: 2 })`, `products.pro()`, `products.proAnnual()`, `products.base()`
