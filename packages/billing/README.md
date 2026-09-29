# @autumn/billing

Meters Autumn's own usage and pushes it to Autumn. Each org is a customer (`customer_id = org.id`).

## USD volume

**Cash collected from live customers, in USD, when it was collected.**

```
invoice counts when   paid_at is set · customer is live
amount                amount_paid  (after discounts, credits, credit notes; tax included)
                      ≤ 0 → skipped
currency              ÷ rate on the paid_at date (Open Exchange Rates), rounded to cents
refunds               ignored
event                 usd_volume · timestamp paid_at · key usd_volume:{invoice.id}
```

### Examples

`tracked` is what we push. `cash` is what the org really collected.

**Upgrade** Pro $20 → Premium $50 on Sep 16

| date | invoice | amount_paid | tracked | cash |
|---|---|---|---|---|
| Sep 1 | Pro | 20 | +20 | 20 |
| Sep 16 | +Premium ½ month 25 · −Pro unused ½ month 10 | 15 | +15 | 35 |
| Oct 1 | Premium | 50 | +50 | 85 |

**Downgrade, credit to balance** Premium $50 → Pro $20 on Sep 16

| date | invoice | amount_paid | tracked | cash |
|---|---|---|---|---|
| Sep 1 | Premium | 50 | +50 | 50 |
| Sep 16 | −Premium unused 25 · +Pro ½ month 10 → −15 to balance | 0 | skip | 50 |
| Oct 1 | Pro 20 · balance −15 | 5 | +5 | 55 |

**Cancel, credit to balance, never returns**

| date | invoice | amount_paid | tracked | cash |
|---|---|---|---|---|
| Sep 1 | Premium | 50 | +50 | 50 |
| Sep 16 | cancel · −25 to balance | 0 | skip | 50 |

**Cancel, cash refund** ← the one case we overstate

| date | event | amount_paid | tracked | cash |
|---|---|---|---|---|
| Sep 1 | Premium | 50 | +50 | 50 |
| Sep 16 | refund 25 to card | 50 | nothing | 25 |

**Prepaid credits**

| date | invoice | amount_paid | tracked | cash |
|---|---|---|---|---|
| Jan 5 | top-up | 1,000 | +1,000 | 1,000 |
| Feb 1 | usage 200 · balance −200 | 0 | skip | 1,000 |
| Apr 1 | usage 700 · balance −500 · card 200 | 200 | +200 | 1,200 |

**Reissue**

| date | invoice | amount_paid | tracked | cash |
|---|---|---|---|---|
| Jul 14 | original | 12,000 | +12,000 | 12,000 |
| Sep 14 | reissue · credit note 12,000 | 0 | skip | 12,000 |

**Coupon** Pro $375, 20% off → amount_paid 300 → **+300**

**Tax** $100 + $20 VAT → amount_paid 120 → **+120**

**Foreign currency** ¥15,000 on 2026-09-26, 1 USD = 157.285 JPY → 15,000 ÷ 157.285 → **+95.37**
(stored in major units; event carries `rate`, `rate_date`, `source`)

### Not counted

sandbox customers · rows from `invoices.insert` · unlinked Stripe customers · refunds, disputes, post-payment credit notes
