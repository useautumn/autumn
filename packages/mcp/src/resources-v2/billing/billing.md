---
name: billing
title: Billing
description: Autumn billing object relationships for agents.
priority: 0.95
audience:
  - assistant
---

# Billing

Use this resource for Autumn billing-related questions and actions.

For billing changes, preview before writing and require explicit approval before mutating state.
Common tools: `previewAttach`, `attach`, `previewUpdateSubscription`, `updateSubscription`, `previewCreateSchedule`, `createSchedule`.

## Object Graph

```txt
Organization
- features[] -> Feature
- plans[] -> Plan
- customers[] -> Customer

Configuration model:
Feature
- referenced by -> Plan Item

Plan
- items[] -> Plan Item
  - feature_id -> Feature
  - optional price -> usage_based or prepaid feature price
- price -> base recurring or one-off price

Plan Item
- feature_id -> Feature
- optional price -> usage_based or prepaid feature price

Runtime model:
Customer
- subscriptions[] -> Subscription -> Plan
- purchases[] -> Purchase -> Plan
- balances[feature_id] -> Balance -> Feature
- flags[feature_id] -> Flag -> Feature
- billing_controls -> customer-level usage controls
- entities[] -> Entity -> same runtime shape scoped under Customer

Entity
- belongs to -> Customer
- subscriptions[] -> Subscription -> Plan
- purchases[] -> Purchase -> Plan
- balances[feature_id] -> Balance -> Feature
- flags[feature_id] -> Flag -> Feature
- billing_controls -> entity-level controls where supported

From config to customer state:
Plan + Customer --billing.attach--> Subscription or Purchase
Plan + Customer + entity_id --billing.attach--> Entity-scoped Subscription or Purchase
Subscription/Purchase -> Balance or Flag provisioning
```
