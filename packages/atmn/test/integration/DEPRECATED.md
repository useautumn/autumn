# Deprecated — v1 atmn integration

These tests drive `packages/atmn` (v1: `--headless`, `--config`, `item()`).
`bun atl` now runs `atmn-nightly` (v3). Don't port these; rewrite against
nightly when we redo the suite.

`bun atmn test:integration` and `test:integration:cli` are no-ops.
