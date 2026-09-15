## Free Plans

Free plans let you give every new customer access to a limited set of features at no cost. They're the foundation of freemium models — customers start free and upgrade when they need more.

> **Example** <br />
> A developer tool offers a free tier with 100 API requests per month and 1 workspace. When a user exceeds the limit, they're prompted to upgrade.

## Setting up

Create a plan with no `price` and set `autoEnable: true`:

```ts autumn.config.ts
import { atmn, feature, plan } from "atmn";

export const apiRequests = feature({
  featureId: "api_requests",
  name: "API Requests",
  type: "metered",
  consumable: true,
});

export const workspaces = feature({
  featureId: "workspaces",
  name: "Workspaces",
  type: "metered",
  consumable: false,
});

export const free = plan({
  planId: "free",
  versionSlug: "v1",
  active: true,
  name: "Free",
  group: "main",
  autoEnable: true,
  items: [
    {
      featureId: apiRequests.featureId,
      included: 100,
      reset: { interval: "month" },
    },
    {
      featureId: workspaces.featureId,
      included: 1,
    },
  ],
});

export default atmn({ features: [apiRequests, workspaces], plans: [free] });
```

Preview with `atmn push`, then apply with `atmn push --yes`.

## How it works

When `autoEnable` is set, every new customer created via the API or SDK is automatically assigned this plan. This flag can only be set if there are no prices on the plan. Since there are no prices, no payment is required.

If a customer cancels their paid plan and you have an auto-enabled free plan in the same group, the free plan will be re-activated automatically.

## Gating features

Use the [check](/documentation/customers/check) endpoint to gate access based on the free plan's limits:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.check({
  customer_id: "user_123",
  feature_id: "api_requests",
});

if (!data.allowed) {
  // Prompt user to upgrade
}
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.check(
    customer_id="user_123",
    feature_id="api_requests",
)

if not response.allowed:
    # Prompt user to upgrade
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "api_requests"
  }'
```

</CodeGroup>

When `allowed` is `false`, the customer has exhausted their free tier balance. This is a good moment to prompt them to upgrade.
