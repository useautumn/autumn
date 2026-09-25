# balances.create and balances.delete on the balance worker

## Rule

Balance endpoints are engine commands; billing actions are plans. `create` is a plain
row insert, so it rides a plan. `delete` decides balances (usage, carrier), so it is
a command, the way `updateBalance` is.

Reads go through `getSubjectFullCustomer` (worker view, else FullSubject cache;
Postgres only on a failed read). Rows are selected by the same live-row rule every
view uses: `isLiveLooseCustomerEntitlement` (shared).

## create (done)

`customEntitlements` + `insertCustomerEntitlements` on one plan. A grant for an entity names it
through `existingEntities`, so entity-scoped creates reach the worker too.

## delete

```
server
  balances.delete
    worker on, not dashboard includeExpired -> client.deleteBalance(command)
    otherwise                               -> deleteBalance (today's code)
  refusals map to legacy's messages (404, paid 409, pooled 409, invoice credit 400)

engine: commands/deleteBalance/
  computeDeleteBalance.ts     rows -> guards -> steps -> ONE mutation
  steps/
    deleteRows.ts             rows and their rollovers; their products marked is_custom
    recalculateUsage.ts       live usage of the deleted rows (not expired)
                                the feature has rows left? draw it on them (overflow,
                                no spend limit, no windows: the update-balance draw)
                                none? the first deleted row stays as the overage carrier:
                                balance −usage, adjustment −grant, resets cleared
  types/deleteBalanceCommand.ts, deleteBalanceResult.ts

rows = the feature's rows (or every row), filters, live loose rows only
```

## Slices

| # | Slice | Delete cases |
|---|---|---|
| 1 ✓ | Engine command: rows, guards, deleteRows, recalculateUsage, unit tests | engine |
| 2 ✓ | Worker processor + client + server routing and error mapping | 1–5, 2b–2i |
| 3 ✓ | Dashboard `recalculateBalance`: engine command (preview = same compute, no write), live-row rule | recalculate 11/11 |

Spec: `server/tests/integration/balances/delete/delete-balance.test.ts` (13 cases; 2i removed:
it expected a drained grant to be deleted and counted, which the live-row rule hides).

## Decisions made while landing

- Delete answers at "store" durability: callers (and the tests) read Postgres right after.
- The committer writes every command's changes except an initialize's (its rows are Postgres's
  own baseline); it used to allow subject-row changes only from billing plans.
- `expectRawBalance` is scoped to the test's customer: concurrent tests share external ids.
