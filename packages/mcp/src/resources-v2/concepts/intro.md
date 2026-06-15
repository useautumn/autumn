## Intro

Autumn is a database for your application billing state: features, plans, customers, subscriptions, purchases, balances, flags, and billing controls.
It helps you iterate on pricing, manage credit access and usage, control overage, and keep billing behavior connected to product access.

<internal>

- Autumn is a layer above Stripe; Stripe still handles subscription management, invoicing, and payment processing.
- Autumn billing management provisions and updates Stripe subscriptions, schedules, invoices, and related billing objects for you.

</internal>

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
