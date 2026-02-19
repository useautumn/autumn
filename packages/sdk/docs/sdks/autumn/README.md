# Autumn SDK

## Overview

### Available Operations

* [check](#check) - Checks whether a customer currently has enough balance to use a feature.

Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.

@example
```typescript
// Check access for a feature
const response = await client.check({ customerId: "cus_123", featureId: "messages" });
```

@example
```typescript
// Check and consume 3 units in one call
const response = await client.check({

  customerId: "cus_123",
  featureId: "messages",
  requiredBalance: 3,
  sendEvent: true,
});
```

@param customerId - The ID of the customer.
@param featureId - The ID of the feature.
@param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
@param requiredBalance - Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1. (optional)
@param properties - Additional properties to attach to the usage event if send_event is true. (optional)
@param sendEvent - If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call. (optional)
@param withPreview - If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls. (optional)

@returns Whether access is allowed, plus the current balance for that feature.
* [track](#track) - Records usage for a customer feature and returns updated balances.

Use this after an action happens to decrement usage, or send a negative value to credit balance back.

@example
```typescript
// Track one message event
const response = await client.track({ customerId: "cus_123", featureId: "messages", value: 1 });
```

@example
```typescript
// Track an event mapped to multiple features
const response = await client.track({ customerId: "cus_123", eventName: "ai_chat_request", value: 1 });
```

@param customerId - The ID of the customer.
@param featureId - The ID of the feature to track usage for. Required if event_name is not provided. (optional)
@param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
@param eventName - Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. (optional)
@param value - The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat). (optional)
@param properties - Additional properties to attach to this usage event. (optional)

@returns The usage value recorded, with either a single updated balance or a map of updated balances.

## check

Checks whether a customer currently has enough balance to use a feature.

Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.

@example
```typescript
// Check access for a feature
const response = await client.check({ customerId: "cus_123", featureId: "messages" });
```

@example
```typescript
// Check and consume 3 units in one call
const response = await client.check({

  customerId: "cus_123",
  featureId: "messages",
  requiredBalance: 3,
  sendEvent: true,
});
```

@param customerId - The ID of the customer.
@param featureId - The ID of the feature.
@param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
@param requiredBalance - Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1. (optional)
@param properties - Additional properties to attach to the usage event if send_event is true. (optional)
@param sendEvent - If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call. (optional)
@param withPreview - If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls. (optional)

@returns Whether access is allowed, plus the current balance for that feature.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="check" method="post" path="/v1/balances.check" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.check({
    customerId: "cus_123",
    featureId: "messages",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { check } from "@useautumn/sdk/funcs/check.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await check(autumn, {
    customerId: "cus_123",
    featureId: "messages",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("check failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CheckParams](../../models/check-params.md)                                                                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.CheckResponse](../../models/check-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## track

Records usage for a customer feature and returns updated balances.

Use this after an action happens to decrement usage, or send a negative value to credit balance back.

@example
```typescript
// Track one message event
const response = await client.track({ customerId: "cus_123", featureId: "messages", value: 1 });
```

@example
```typescript
// Track an event mapped to multiple features
const response = await client.track({ customerId: "cus_123", eventName: "ai_chat_request", value: 1 });
```

@param customerId - The ID of the customer.
@param featureId - The ID of the feature to track usage for. Required if event_name is not provided. (optional)
@param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
@param eventName - Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. (optional)
@param value - The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat). (optional)
@param properties - Additional properties to attach to this usage event. (optional)

@returns The usage value recorded, with either a single updated balance or a map of updated balances.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="track" method="post" path="/v1/balances.track" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.track({
    customerId: "cus_123",
    featureId: "messages",
    value: 1,
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { track } from "@useautumn/sdk/funcs/track.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await track(autumn, {
    customerId: "cus_123",
    featureId: "messages",
    value: 1,
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("track failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.TrackParams](../../models/track-params.md)                                                                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.TrackResponse](../../models/track-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |