---
author: john + claude
feature: customer-cache
date: 2026-09-29
status: research-in-progress
---

# How other platforms answer checks locally

No one pushes a check-ready entry into the customer's cloud that covers credits, rate cards and
entity limits. The closest are Schematic (local checks) and Stigg (hierarchies).

| platform | what the SDK holds | how it decides |
|---|---|---|
| Schematic | rules + per-company metrics and credit balances, replicated into the customer's Redis | one Rust engine compiled to WASM, shared by every SDK; credit holds (leases of 10k credits) bound overshoot |
| Stigg | per-customer limit + usage, in memory or customer Redis | SDK adds `requestedUsage`; org → team → user chains only checked on Stigg's servers |
| LaunchDarkly / Unleash / Statsig / GrowthBook | versioned rule documents | local evaluation; shared Rust cores after 30+ SDKs drifted |
| Unkey, Cloudflare, Upstash | counters | decide locally, reconcile asynchronously: "bounded overshoot" |
| Stripe, Orb, Metronome, Lago, OpenMeter | nothing local | server-side checks or threshold webhooks |

## What recurs

1. **Ship rules + state; compute the answer at read.** Results can't answer "N units with
   these properties" (Stripe ships lookup keys; everyone else ships rules).
2. **One engine for every SDK.** Unleash, Statsig and Schematic each rebuilt around a shared
   core after per-language drift.
3. **Schema version in the key namespace.** Schematic hashes its struct layout into keys;
   Statsig puts `/v1` in the key. Stigg didn't, and its v3 needed a strict upgrade order or
   customers read "incorrect entitlement data".
4. **Additive only; unknown means safe.** GrowthBook strips rule keys an SDK can't run and puts
   new meaning under new keys; Unleash turns a toggle it can't compile off, the rest still loads.
5. **Limits as a list of meters, each scoped, all must pass.** Stigg's chains report which limit
   blocked; OpenMeter models "gpt-4 tokens" as a meter with a property filter.
6. **Only newer writes land.** LaunchDarkly's per-item version; ours is the log offset.
7. **Tiered costs evaluated locally: nobody.** It only exists on billing back ends today.

Sources: docs.stigg.io (local-caching, persistent-caching, governance), github.com/SchematicHQ/rulesengine,
docs.schematichq.com/billing/credit-holds, getunleash.io/blog/yggdrasil-unleash-flag-evaluation-engine,
docs.statsig.com/server/concepts/data_store, growthbook `packages/shared/src/sdk-versioning`,
engineering.unkey.com/architecture/ratelimiting/consistency-model.
