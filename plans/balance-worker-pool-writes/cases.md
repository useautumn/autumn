# Case matrices

## Unit 2: a pooled attach lands through the worker

Rows and ownership: the pool row and POOL_CE are the customer's; a SOURCE_CE belongs to its
product's owner (an entity or the customer); a contribution row is never state. The synthetic
pool entitlement is a catalog row, written before the worker like custom items.

### Engine: op → changes (`computeApplyBillingPlan`)

| # | op | state before | changes | why |
|---|---|---|---|---|
| E1 | `insert pooledBalances` (whole row) | pool absent | `pooledBalances insert` | the row lands as sent; `granted` as the server sends it (0 for a new non-license pool, see S2) |
| E2 | `insert pooledBalances` | pool present | stale | the worker's copy is behind |
| E3 | `insert pooledContributions { row }` | source held, `pooled_contribution_id` null | `pooledContributions insert` (log-carried) · source `update` → balance 0, adjustment 0, additional_balance 0, entities null, pooled_contribution_id | **revised (unit 3):** the pool's totals move by the plan's own `increment` ops, never derived |
| E4 | `update pooledContributions { id, set }` | — | `pooledContributions update` (carried, `before: {}`) | never state |
| E5 | same, source not held | stale | a routed plan always names the source's owner; missing means behind |
| E6 | same, source already contributes (`pooled_contribution_id` set) | stale | the Postgres lane reconciles on conflict; the worker cannot without the old row |
| E7 | same, pool not held | stale | |
| E8 | `increment pooledBalances { granted }` (license resize, unit 2 keeps the op) | pool held | `pooledBalances increment` | |
| E9 | `update pooledBalances { reset_cycle_anchor, stripe_subscription_id, customer_license_link_id, updated_at }` | pool held | `pooledBalances update` | lifecycle columns the plan sets |
| E10 | `increment customerEntitlements { balance }` on POOL_CE | held | existing increment | the pool's balance moves by the server's delta (usage carry is compute) |
| E11 | `insert rollovers` on POOL_CE | POOL_CE held or inserted by this plan | existing insert | pool rollovers carried from a source |
| E12 | ops in a plan naming the source's entity | | E3's changes split: contribution + pool + POOL_CE to the customer part, source update to the entity part | one mutation, both owners |

### Server: facet → ops (`pooledBalancePlanToPlanOps`)

| # | facet | ops (in order) |
|---|---|---|
| S1 | `insertPoolBalances[i]` | `insert customerEntitlements` (POOL_CE, balance as computed) · `insert pooledBalances` |
| S2 | `insertPoolBalances[i]` | pool row sent with `granted` as computed (**revised** in unit 3) |
| S3 | `deletePoolContributions[i]` | `delete pooledContributions { id, pooledBalanceId, sourceCustomerEntitlementId }`; the worker's `withExpiringPooledBalances` asks Postgres which pools keep no share and stamps `expiringPooledBalanceIds` on the command |
| S4 | `insertPoolContributions[i]` | `insert pooledContributions { row }` |
| S5 | `updatePoolBalances[i]` | `increment customerEntitlements { balance: balanceDelta }` when ≠ 0 · `update pooledBalances` lifecycle columns · license-linked only: `increment pooledBalances { granted: grantedDelta }` when ≠ 0 |
| S6 | `updatePoolContributions[i]` | `update pooledContributions` with the row's values |
| S7 | `insertPoolRollovers[i]` | `insert rollovers` |
| S8 | `insertPoolBalances[i].entitlement` | not an op: inserted in Postgres before the worker (`insertCustomCatalogRows`) and sent as a catalog row |
| S9 | `expirePoolBalanceCandidates` | nothing: the worker decides expiry |
| S10 | `deletePoolBalances` (rollback) | `delete pooledBalances` · `delete customerEntitlements` (POOL_CE) |

### Postgres

| # | case | expectation |
|---|---|---|
| P1 | hydration, product entitlement with `pooled_contribution_id` | loaded (the `IS NULL` cut goes); balance 0 |
| P2 | hydration, POOL_CE | unchanged (pooled_entitlements) |
| P3 | committer, `pooledContributions insert` | row in `pooled_balance_contributions` |
| P4 | committer, `pooledBalances insert` | whole row |
| P5 | committer, `pooledBalances increment granted` | `granted = granted + Δ` |
| P6 | committer, `pooledBalances update` lifecycle | plain SET |

### Worker, end to end (integration)

| # | scenario | expectation |
|---|---|---|
| W1 | attach a pooled plan to two entities through the worker | pool `granted` 200, POOL_CE 200 in the worker's read; both SOURCE_CE at 0 in state and Postgres; two contribution rows; `pooled_balances` row present |
| W2 | then track through either entity | draws from 200 |
| W3 | attach to a third entity (existing pool) | `granted` 300, POOL_CE 300, three contributions |
| W4 | the plan's source entity not named | refused before anything is logged |
