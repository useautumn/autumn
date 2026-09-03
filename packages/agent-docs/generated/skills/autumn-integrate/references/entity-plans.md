## Entity Plans

An **entity** is a resource that lives under a parent customer — a user, a workspace, a project. Entity plans let each of those hold its own plan, with its own balances, while the parent customer pays.

> **Example** <br />
> A team plan costs $30/seat/month. Each seat gets 50 AI meeting summaries per month. If a team has 5 users, each user has their own balance of 50 summaries — they can't use each other's allocation.

## Two ways to provision

Both approaches end in the same place: an entity holding a plan. They differ in **where capacity comes from**.

```
                     an entity holds a plan
                              │
         ┌────────────────────┴────────────────────┐
    attach directly                            licenses
    ───────────────                            ────────
    capacity = whoever you attached            capacity = a pool of seats you bought
    charged when the entity is attached        charged when the seats are bought
    no unassigned state                        seats can sit empty, be reassigned
```

Pick with one question: **do you sell capacity before you know who fills it?**

| | Attach directly | Licenses |
|---|---|---|
| **Use when** | Entities appear and you bill for them as they do | Customers commit to a seat count upfront |
| **Buying** | `billing.attach` per entity | `licenseQuantities` on the parent plan |
| **Provisioning** | Same `billing.attach` call | `licenses.attach` assigns from the pool |
| **Removing** | `billing.update` with a cancel action | `licenses.release` returns the seat to the pool |
| **Empty seats** | Not possible | Bought but unassigned seats are normal |

Different tiers per entity work in **both** modes — attach different plans to different entities, or offer more than one license plan under the same parent.

Entities are created with a `feature_id` identifying their type (e.g. a non-consumable `seats` or `workspaces` feature). If you only need to *count* seats and bill for them, with no per-seat balances or identity, you don't need entities at all — see [per-seat pricing](/documentation/modelling-pricing/per-unit-pricing).

## Attaching plans directly

Create your plans as normal — no entity-specific configuration on the plan itself. Put plans that should replace each other on upgrade/downgrade in the same `group`.

<Tabs>
<Tab title="CLI">

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const requests = feature({
  id: 'requests',
  name: 'API Requests',
  type: 'metered',
  consumable: true,
});

export const workspaceFree = plan({
  id: 'workspace_free',
  name: 'Workspace Free',
  group: 'workspace',
  items: [
    item({
      featureId: requests.id,
      included: 100,
      reset: { interval: 'month' },
    }),
  ],
});

export const workspacePro = plan({
  id: 'workspace_pro',
  name: 'Workspace Pro',
  group: 'workspace',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: requests.id,
      included: 10000,
      reset: { interval: 'month' },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Create your plan tiers as normal (e.g. "Workspace Free", "Workspace Pro")
2. Set the same **group** on plans that should replace each other on upgrade/downgrade
3. Entity-level attachment is handled via the API — no extra dashboard configuration needed

</Tab>
</Tabs>

#### Create the entity

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

await autumn.entities.create({
  customerId: "org_123",
  entityId: "workspace_a",
  featureId: "workspaces",
  name: "Workspace A",
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

await autumn.entities.create(
    customer_id="org_123",
    entity_id="workspace_a",
    feature_id="workspaces",
    name="Workspace A",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/entities.create" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "entity_id": "workspace_a",
    "feature_id": "workspaces",
    "name": "Workspace A"
  }'
```

</CodeGroup>

#### Attach a plan to it

Pass `entityId` to scope the attach to that entity:

<CodeGroup>

```typescript TypeScript
await autumn.billing.attach({
  customerId: "org_123",
  planId: "workspace_pro",
  entityId: "workspace_a",
});
```

```python Python
await autumn.billing.attach(
    customer_id="org_123",
    plan_id="workspace_pro",
    entity_id="workspace_a",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "workspace_pro",
    "entity_id": "workspace_a"
  }'
```

</CodeGroup>

Each entity's subscription is created separately in Stripe, with billing cycles synced to the parent customer.

To upgrade or downgrade, attach the new plan with the same `entityId` — the usual [upgrade/downgrade](/documentation/customers/subscription-lifecycle) logic applies.

#### Cancel an entity's plan

<CodeGroup>

```typescript TypeScript
await autumn.billing.update({
  customerId: "org_123",
  planId: "workspace_pro",
  entityId: "workspace_a",
  cancelAction: "cancel_end_of_cycle",
});
```

```python Python
await autumn.billing.update(
    customer_id="org_123",
    plan_id="workspace_pro",
    entity_id="workspace_a",
    cancel_action="cancel_end_of_cycle",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.update" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "workspace_pro",
    "entity_id": "workspace_a",
    "cancel_action": "cancel_end_of_cycle"
  }'
```

</CodeGroup>

The same [cancel/uncancel](/documentation/customers/subscription-lifecycle#cancellations) behavior applies.

## Licenses

A **license plan** describes everything one entity gets. The parent plan offers a pool of them, and you assign one to an entity to hand it its own balance.

```
team plan  ──licenses: [{ seat, included: 1 }]──►  pool of seats
                                                     │
                                    licenses.attach  │  licenses.release
                                                     ▼
                              entity "user_alice"  ──►  own balance: 50 summaries/mo
```

The pool has a `granted` size (included seats plus any paid seats), a `usage` count (seats currently assigned), and a `remaining` count. Assigning consumes a seat; releasing gives it back.

<Tabs>
<Tab title="CLI">

Create the feature each seat consumes, then a license plan holding what one seat gets. Link it from the parent plan via `licenses`:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const summaries = feature({
  id: 'summaries',
  name: 'Meeting Summaries',
  type: 'metered',
  consumable: true,
});

// Everything one seat gets, priced per seat.
export const seat = plan({
  id: 'seat',
  name: 'Seat',
  group: 'licenses',
  price: { amount: 30, interval: 'month' },
  items: [
    item({
      featureId: summaries.id,
      included: 50,
      reset: { interval: 'month' },
    }),
  ],
});

export const team = plan({
  id: 'team',
  name: 'Team',
  licenses: [
    { licensePlanId: seat.id, included: 1 },
  ],
});
```

`included: 1` means the Team plan comes with one free seat. Seats beyond that are paid at the license plan's own price.

Push changes with `atmn push`.

Give the license plan its own `group`. Attaching a plan replaces other plans in the same group, so a license plan sharing a group with its parent would knock the parent off.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create the license plan (e.g. "Seat") — give it its own group, its per-seat price, and the features one seat receives (e.g. 50 Meeting Summaries per month)
2. Create or edit the parent plan (e.g. "Team")
3. Under **Licenses**, add the Seat plan and set how many seats are **included**
4. Save the plan

</Tab>
</Tabs>

#### Buy seats

Seats are bought on the parent plan. `quantity` is the **total** number of seats, including the plan's free `included` amount:

<CodeGroup>

```typescript TypeScript
await autumn.billing.attach({
  customerId: "org_123",
  planId: "team",
  licenseQuantities: [{
    licensePlanId: "seat",
    quantity: 5,
  }],
});
```

```python Python
await autumn.billing.attach(
    customer_id="org_123",
    plan_id="team",
    license_quantities=[{
        "license_plan_id": "seat",
        "quantity": 5,
    }],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "team",
    "license_quantities": [
      { "license_plan_id": "seat", "quantity": 5 }
    ]
  }'
```

</CodeGroup>

With 1 included seat and `quantity: 5`, the customer gets 5 seats and pays for 4. Attach again with a new `quantity` to change the count later — Autumn prorates the difference.

A **priced** license plan must be attached at the customer level before it can be assigned to entities. Buying seats with `licenseQuantities` does this for you.

#### Assign a license

Assigning is what provisions the entity's individual balance — creating an entity on its own does not:

<CodeGroup>

```typescript TypeScript
await autumn.licenses.attach({
  customerId: "org_123",
  planId: "seat",
  entities: [
    { entityId: "user_alice", name: "Alice", featureId: "seats" },
  ],
});
```

```python Python
await autumn.licenses.attach(
    customer_id="org_123",
    plan_id="seat",
    entities=[
        {"entity_id": "user_alice", "name": "Alice", "feature_id": "seats"},
    ],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "seat",
    "entities": [
      { "entity_id": "user_alice", "name": "Alice", "feature_id": "seats" }
    ]
  }'
```

</CodeGroup>

`feature_id` is the entity type and is required only when the entity doesn't exist yet — Autumn creates it for you. You can pass several entities in one call.

Assignment is idempotent. Re-assigning an entity that already holds an active license for the same plan succeeds without consuming another seat. If the pool has no seats left, the call errors — buy more seats first.

#### Release a license

The entity's balance is removed and the seat returns to the pool, ready to reassign:

<CodeGroup>

```typescript TypeScript
await autumn.licenses.release({
  customerId: "org_123",
  licensePlanId: "seat",
  entityIds: ["user_alice"],
});
```

```python Python
await autumn.licenses.release(
    customer_id="org_123",
    license_plan_id="seat",
    entity_ids=["user_alice"],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.release" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "license_plan_id": "seat",
    "entity_ids": ["user_alice"]
  }'
```

</CodeGroup>

Releasing frees the seat but does not change what the customer pays — they keep the seats they bought. To stop paying for one, attach the parent plan again with a lower `quantity`.

`license_plan_id` is optional, and only needed to disambiguate when an entity holds licenses from more than one plan.

#### Inspect seats

[`licenses.list`](/api-reference/licenses/listLicenses) returns each pool with its `granted`, `usage`, and `remaining` counts. [`licenses.list_assignments`](/api-reference/licenses/listLicenseAssignments) returns which entities currently hold one.

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.list" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{ "customer_id": "org_123" }'
```

## Checking and tracking per entity

Regardless of how the entity got its plan, pass `entity_id` to `check` and `track` to operate on that entity's balance:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.check({
  customer_id: "org_123",
  feature_id: "summaries",
  entity_id: "user_alice",
});

console.log(data.allowed);
console.log(data.balance);
```

```python Python
response = await autumn.check(
    customer_id="org_123",
    feature_id="summaries",
    entity_id="user_alice",
)

print(response.allowed)
print(response.balance)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "feature_id": "summaries",
    "entity_id": "user_alice"
  }'
```

</CodeGroup>

Track the same way:

<CodeGroup>

```typescript TypeScript
await autumn.track({
  customer_id: "org_123",
  feature_id: "summaries",
  entity_id: "user_alice",
  value: 1,
});
```

```python Python
await autumn.track(
    customer_id="org_123",
    feature_id="summaries",
    entity_id="user_alice",
    value=1,
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/track" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "feature_id": "summaries",
    "entity_id": "user_alice",
    "value": 1
  }'
```

</CodeGroup>

### Customer-level vs entity-level

| Level | How to use | Behavior |
|-------|-----------|----------|
| **Entity-level** | Pass `entity_id` in check/track | Checks/deducts from that entity's individual balance |
| **Customer-level** | Omit `entity_id` | Returns the total balance across all entities |

When tracking at the customer level (without `entity_id`), usage is deducted from the first-assigned entity to keep entity-level totals in sync with the customer-level total.

## Worked example

[Entity-level balances](/examples/entity-balances) walks the licenses model end to end: an AI meeting-notes product on team pricing, from customer creation through buying seats, assigning them, and releasing them when someone leaves.
