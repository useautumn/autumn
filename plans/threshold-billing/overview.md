---
author: Codex
feature: threshold billing
date: 2026-09-08
status: ready-for-review
---

# Threshold billing

This reading tree records the current storage and execution paths relevant to billing accumulated overage when a plan item's threshold is crossed.

Slack contract: a plan-item config defines an overage value; crossing it creates an immediate charge, failed payment blocks that plan's entitlements, `ignore_past_due` keeps them usable, and a successful charge clears the balance. The behavior must preserve dimensions, credit systems, and payment-processing states.

Next: confirm threshold units/scope and payment-state policy, then turn this research into an implementation plan.
