# Plans

## Overview

### Available Operations

* [create](#create) - Create a plan
* [get](#get) - Get a plan
* [list](#list) - List all plans
* [update](#update) - Update a plan
* [delete](#delete) - Delete a plan

## create

Creates a new plan with optional base price and feature configurations.

Use this to programmatically create pricing plans. See [How plans work](/documentation/pricing/plans) for concepts.

@example
```typescript
// Create a free plan with limited features
const response = await client.plans.create({
  planId: "free_plan",
  name: "Free",
  autoEnable: true,
  items: [{"featureId":"messages","included":100,"reset":{"interval":"month"}}],
});
```

@example
```typescript
// Create a paid plan with base price and usage-based feature
const response = await client.plans.create({
  planId: "pro_plan",
  name: "Pro Plan",
  price: {"amount":10,"interval":"month"},
  items: [{"featureId":"messages","included":1000,"reset":{"interval":"month"},"price":{"amount":0.01,"interval":"month","billingUnits":1,"billingMethod":"usage_based"}}],
});
```

@example
```typescript
// Create a plan with prepaid seats
const response = await client.plans.create({
  planId: "team_plan",
  name: "Team Plan",
  price: {"amount":49,"interval":"month"},
  items: [{"featureId":"seats","included":5,"price":{"amount":10,"interval":"month","billingUnits":1,"billingMethod":"prepaid"}}],
});
```

@example
```typescript
// Create an add-on plan
const response = await client.plans.create({
  planId: "analytics_addon",
  name: "Advanced Analytics",
  addOn: true,
  price: {"amount":20,"interval":"month"},
});
```

@example
```typescript
// Create a plan with tiered pricing
const response = await client.plans.create({ planId: "api_plan", name: "API Plan", items: [{"featureId":"api_calls","included":1000,"reset":{"interval":"month"},"price":{"tiers":[{"to":10000,"amount":0.001},{"to":100000,"amount":0.0005},{"to":"inf","amount":0.0001}],"interval":"month","billingUnits":1,"billingMethod":"usage_based"}}] });
```

@example
```typescript
// Create a plan with free trial
const response = await client.plans.create({
  planId: "premium_plan",
  name: "Premium",
  price: {"amount":99,"interval":"month"},
  freeTrial: {"durationLength":14,"durationType":"day","cardRequired":true},
});
```

@param planId - The ID of the plan to create.
@param group - Group identifier for organizing related plans. Plans in the same group are mutually exclusive. (optional)
@param name - Display name of the plan.
@param description - Optional description of the plan. (optional)
@param addOn - If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group. (optional)
@param autoEnable - If true, plan is automatically attached when a customer is created. Use for free tiers. (optional)
@param price - Base recurring price for the plan. Omit for free or usage-only plans. (optional)
@param items - Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. (optional)
@param freeTrial - Free trial configuration. Customers can try this plan before being charged. (optional)

@returns The created plan object.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="createPlan" method="post" path="/v1/plans.create" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.plans.create({
    planId: "free_plan",
    name: "Free",
    autoEnable: true,
    items: [
      {
        featureId: "messages",
        included: 100,
        reset: {
          interval: "month",
        },
      },
    ],
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { plansCreate } from "@useautumn/sdk/funcs/plans-create.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await plansCreate(autumn, {
    planId: "free_plan",
    name: "Free",
    autoEnable: true,
    items: [
      {
        featureId: "messages",
        included: 100,
        reset: {
          interval: "month",
        },
      },
    ],
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("plansCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreatePlanParams](../../models/create-plan-params.md)                                                                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.CreatePlanResponse](../../models/create-plan-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Retrieves a single plan by its ID.

Use this to fetch the full configuration of a specific plan, including its features and pricing.

@example
```typescript
// Get a plan by ID
const response = await client.plans.get({ planId: "pro_plan" });
```

@example
```typescript
// Get a specific version of a plan
const response = await client.plans.get({ planId: "pro_plan", version: 2 });
```

@param planId - The ID of the plan to retrieve.
@param version - The version of the plan to get. Defaults to the latest version. (optional)

@returns The plan object with its full configuration.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getPlan" method="post" path="/v1/plans.get" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.plans.get({
    planId: "pro_plan",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { plansGet } from "@useautumn/sdk/funcs/plans-get.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await plansGet(autumn, {
    planId: "pro_plan",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("plansGet failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.GetPlanParams](../../models/get-plan-params.md)                                                                                                                        | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.GetPlanResponse](../../models/get-plan-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## list

Lists all plans in the current environment.

Use this to retrieve all plans for displaying pricing pages or managing plan configurations.

@returns A list of all plans with their pricing and feature configurations.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="listPlans" method="post" path="/v1/plans.list" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.plans.list({});

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { plansList } from "@useautumn/sdk/funcs/plans-list.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await plansList(autumn, {});
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("plansList failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.ListPlansParams](../../models/list-plans-params.md)                                                                                                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.ListPlansResponse](../../models/list-plans-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing plan. Creates a new version unless `disableVersion` is set.

Use this to modify plan properties, pricing, or feature configurations. See [Adding features to plans](/documentation/pricing/plan-features) for item configuration.

@example
```typescript
// Update plan name and price
const response = await client.plans.update({ planId: "pro_plan", name: "Pro Plan (Updated)", price: {"amount":15,"interval":"month"} });
```

@example
```typescript
// Add a feature to an existing plan
const response = await client.plans.update({ planId: "pro_plan", items: [{"featureId":"messages","included":1000,"reset":{"interval":"month"}},{"featureId":"storage","included":10,"reset":{"interval":"month"}}] });
```

@example
```typescript
// Remove the base price (make usage-only)
const response = await client.plans.update({ planId: "pro_plan", price: null });
```

@example
```typescript
// Archive a plan
const response = await client.plans.update({ planId: "old_plan", archived: true });
```

@example
```typescript
// Update feature's included amount
const response = await client.plans.update({ planId: "pro_plan", items: [{"featureId":"messages","included":2000,"reset":{"interval":"month"}}] });
```

@param planId - The ID of the plan to update.
@param group - Group identifier for organizing related plans. Plans in the same group are mutually exclusive. (optional)
@param name - Display name of the plan. (optional)
@param addOn - Whether the plan is an add-on. (optional)
@param autoEnable - Whether the plan is automatically enabled. (optional)
@param price - The price of the plan. Set to null to remove the base price. (optional)
@param items - Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. (optional)
@param freeTrial - The free trial of the plan. Set to null to remove the free trial. (optional)
@param newPlanId - The new ID to use for the plan. Can only be updated if the plan has not been used by any customers. (optional)

@returns The updated plan object.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="updatePlan" method="post" path="/v1/plans.update" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.plans.update({
    planId: "pro_plan",
    name: "Pro Plan (Updated)",
    price: {
      amount: 15,
      interval: "month",
    },
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { plansUpdate } from "@useautumn/sdk/funcs/plans-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await plansUpdate(autumn, {
    planId: "pro_plan",
    name: "Pro Plan (Updated)",
    price: {
      amount: 15,
      interval: "month",
    },
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("plansUpdate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.UpdatePlanParams](../../models/update-plan-params.md)                                                                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.UpdatePlanResponse](../../models/update-plan-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes a plan by its ID.

Use this to permanently remove a plan. Plans with active customers cannot be deleted - archive them instead.

@example
```typescript
// Delete a plan
const response = await client.plans.delete({ planId: "unused_plan" });
```

@example
```typescript
// Delete all versions of a plan
const response = await client.plans.delete({ planId: "legacy_plan", allVersions: true });
```

@param planId - The ID of the plan to delete.
@param allVersions - If true, deletes all versions of the plan. Otherwise, only deletes the latest version. (optional)

@returns A success flag indicating the plan was deleted.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="deletePlan" method="post" path="/v1/plans.delete" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.plans.delete({
    planId: "unused_plan",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { plansDelete } from "@useautumn/sdk/funcs/plans-delete.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await plansDelete(autumn, {
    planId: "unused_plan",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("plansDelete failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.DeletePlanParams](../../models/delete-plan-params.md)                                                                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.DeletePlanResponse](../../models/delete-plan-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |