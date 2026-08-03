# Backfill billing cycle anchors for batch migrations

Batch migrations initialize metered (resetting) customer entitlements from a
per-row anchor ladder: sibling cusEnt cycle → `customer_products.billing_cycle_anchor`
→ `subscriptions.billing_cycle_anchor` → `starts_at` (free plans only). Rows
with no usable anchor fall back to the per-customer lane (skipped). Better
anchor coverage = more customers batch-eligible.

## TODO

1. **Add `billing_cycle_anchor` to `subscriptions`** (numeric ms, nullable) and
   write it wherever we upsert subscription rows from Stripe (the same sync
   path that maintains `current_period_start/end`). Coverage then grows
   automatically as webhooks touch rows.
2. **Backfill `subscriptions.billing_cycle_anchor`** for existing rows: sweep
   Stripe subscriptions (by org) and copy `billing_cycle_anchor` (epoch s → ms).
3. **Probably backfill `customer_products.billing_cycle_anchor` too** — only
   recent attaches stamp it. Derivable from the cusProduct's subscription's
   anchor once (2) lands; entity-scoped/multi-sub rows need care picking which
   subscription is authoritative.

## Notes

- Stripe `billing_cycle_anchor` is the source value attach fetches today —
  prefer it over `current_period_end` (a derived boundary; wrong under trials,
  annual periods, mid-cycle changes).
- Backfill is idempotent and read-mostly; can run as a script per org or a
  one-off sweep. No urgency ordering vs the batch-metered work — the ladder
  degrades gracefully — but every week of coverage shrinks the skipped set.
