# Outbound Webhook Testing

Test Autumn's outbound webhooks using Svix Play (free, no signup).

## Setup

```typescript
import { generatePlayToken, getPlayWebhookUrl, waitForWebhook } from "./utils/svixPlayClient.js";
import { createTestEndpoint, deleteTestEndpoint } from "./utils/svixTestEndpoint.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";

let playToken: string;
let endpointId: string;

beforeAll(async () => {
  playToken = await generatePlayToken();
  const svixAppId = ctx.org.svix_config?.sandbox_app_id;
  if (!svixAppId) throw new Error("Svix not configured");
  endpointId = await createTestEndpoint({ appId: svixAppId, playUrl: getPlayWebhookUrl(playToken) });
});

afterAll(async () => {
  const svixAppId = ctx.org.svix_config?.sandbox_app_id;
  if (svixAppId && endpointId) await deleteTestEndpoint({ appId: svixAppId, endpointId });
});
```

## Test Pattern

```typescript
test.concurrent(`${chalk.yellowBright("webhook: customer.products.updated")}`, async () => {
  const customerId = "webhook-test";
  const freeDefault = products.base({ id: "free", items: [...], isDefault: true });

  // Setup products only (no customer)
  const { autumnV1 } = await initScenario({
    setup: [s.products({ list: [freeDefault], prefix: customerId })],
    actions: [],
  });

  // Create customer with webhooks enabled
  await autumnV1.customers.create({
    id: customerId,
    name: "Test",
    internalOptions: { disable_defaults: false, default_group: customerId },
    skipWebhooks: false,  // Enable webhooks
  });

  // Wait for webhook
  const result = await waitForWebhook<CustomerProductsUpdatedPayload>({
    token: playToken,
    predicate: (p) => p.type === "customer.products.updated" && p.data?.customer?.id === customerId,
    timeoutMs: 15000,
  });

  expect(result).not.toBeNull();
  expect(result?.payload.data.scenario).toBe("new");
});
```

## Key Points

| Normal Tests | Webhook Tests |
|--------------|---------------|
| `initScenario` creates customer | Create customer manually with `skipWebhooks: false` |
| Immediate assertions | Poll with `waitForWebhook` (10-15s timeout) |

## Utilities

| Function | Purpose |
|----------|---------|
| `generatePlayToken()` | Get Svix Play token |
| `getPlayWebhookUrl(token)` | Get webhook URL |
| `waitForWebhook({ token, predicate, timeoutMs })` | Poll for webhook |
| `createTestEndpoint({ appId, playUrl })` | Register endpoint |
| `deleteTestEndpoint({ appId, endpointId })` | Cleanup |

## Location

`server/tests/integration/billing/autumn-webhooks/`
