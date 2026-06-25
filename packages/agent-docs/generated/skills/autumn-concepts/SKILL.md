---
name: autumn-concepts
description: Modeling Autumn pricing or reasoning about features, plans, plan items, customers/entities, trials, or billing controls.
---

# Concepts

Autumn is a database for your application billing state: features, plans, customers, subscriptions, purchases, balances, flags, and billing controls. It helps you iterate on pricing, manage credit access and usage, control overage, and keep billing behavior connected to product access.

Autumn is a layer above Stripe; Stripe still handles subscription management, invoicing, and payment processing. Autumn provisions and updates Stripe subscriptions, schedules, invoices, and related billing objects for you.

## Object graph

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

Use these definitions as the mental model when designing or changing Autumn
pricing. Reason in terms of features, plans, plan items, customers/entities, and
billing controls before writing any config or calling the API — most modeling
mistakes come from conflating a feature with a plan item, or a plan-level price
with a per-feature price.

## Definitions

Load the matching definition when reasoning about that object.

For defining a feature — the atomic unit Autumn gates, tracks, or bills, and its types, read `references/feature.md`.

For defining a plan — the attachable package of items and pricing, read `references/plan.md`.

For modeling plan items, or when you need concrete API request-body examples (included usage, prepaid, usage-based, tiers), read `references/plan-items.md`.

For reasoning about free trials and when billing begins, read `references/trials.md`.

For distinguishing a customer from an entity (seats, sub-accounts) and their runtime billing state, read `references/customer-entity.md`.

For reasoning about billing controls — runtime caps, alerts, overage, and top-ups, read `references/billing-controls.md`.
