# List Customers SQL Optimization

Hand-rolled SQL variants for iterating toward 100ms per page on the list customers cursor query.

## Test fixture

- **Org**: Firecrawl (`biu9vSF7vghBLSKW1UTDwxHBAivjnPaK`)
- **Env**: `live`
- **Limit**: 1000
- **Deep cursor**: `{ t: 1774237983361, id: "772c9569-fc97-4c30-9fd8-c8a585b66755" }` (~45% into ~1.22M customers)

## Variants

| # | File | What changed | Median ms (page 1 / deep) |
|---|------|--------------|---------------------------|
| 00 | `00-baseline-{page1,deep}.sql` | Current `getCursorPaginatedFullCusQuery`, full CTE pipeline, withSubs=true | TBD / TBD |

## How to run

```sh
cat 00-baseline-page1.sql | pbcopy   # paste into Table+
cat 00-baseline-deep.sql | pbcopy
```

Or directly via psql with prod DATABASE_URL set.

## Goal

100ms per page (both first and deep). Currently ~2480ms on Firecrawl per the prior benchmark.
