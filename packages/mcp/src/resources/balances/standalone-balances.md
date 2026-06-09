---
name: balances
title: Standalone Balances
description: How to create standalone, expiring, and entity-scoped balance grants.
priority: 0.8
audience:
  - assistant
---

# Standalone Balances

Use previewCreateBalance and createBalance for standalone grants that are independent of a plan, such as promotional credits, referral credits, manual adjustments, or one-time entity-scoped grants.

Required fields:
- customer_id: parent customer receiving the grant
- feature_id: the balance feature, usually the credit pool such as "credits"
- included_grant: amount to grant

Optional fields:
- entity_id: scope the balance to one entity/workspace/user under the customer
- expires_at: expiry timestamp as UTC epoch milliseconds
- balance_id: stable id for later update/delete targeting

Rules:
- For "50k credits", use included_grant: 50000.
- For "expires in 2 months", use calendar months and compute expires_at from the current request date.
- If preview or response data includes expires_at or next_reset_at, use epochMillisecondsToDate before explaining those timestamps to the user.
- Do not include reset when using expires_at for a one-time expiring grant.
- Do not use rewards for direct operational credit grants.
- Do not grant the entity-count feature itself to the entity; grant the credit/balance feature.

Useful docs:
- https://docs.useautumn.com/documentation/customers/managing-balances
- https://docs.useautumn.com/documentation/customers/balances
- https://docs.useautumn.com/documentation/modelling-pricing/sub-entity-balances
- https://docs.useautumn.com/api-reference/balances/createBalance
