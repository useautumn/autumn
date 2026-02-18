# Billing

## Overview

### Available Operations

* [attach](#attach) - Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

@example
```typescript
// Attach a plan to a customer
const response = await client.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
* [previewAttach](#previewattach) - Preview billing changes before attaching a plan.
* [update](#update) - Update an existing subscription.
* [previewUpdate](#previewupdate) - Preview billing changes before updating a subscription.
* [setupPayment](#setuppayment) - Create a setup payment session for a customer.

## attach

Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

@example
```typescript
// Attach a plan to a customer
const response = await client.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)

### Example Usage

<!-- UsageSnippet language="typescript" operationID="billingAttach" method="post" path="/v1/billing.attach" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.attach({
    customerId: "<id>",
    planId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingAttach } from "@useautumn/sdk/funcs/billing-attach.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingAttach(autumn, {
    customerId: "<id>",
    planId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingAttach failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.BillingAttachRequest](../../models/billing-attach-request.md)                                                                                                          | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.BillingAttachResponse](../../models/billing-attach-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## previewAttach

Preview billing changes before attaching a plan.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="billingPreviewAttach" method="post" path="/v1/billing.preview_attach" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.previewAttach({
    customerId: "<id>",
    planId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingPreviewAttach } from "@useautumn/sdk/funcs/billing-preview-attach.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingPreviewAttach(autumn, {
    customerId: "<id>",
    planId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingPreviewAttach failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.BillingPreviewAttachRequest](../../models/billing-preview-attach-request.md)                                                                                           | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.BillingPreviewAttachResponse](../../models/billing-preview-attach-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Update an existing subscription.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="billingUpdate" method="post" path="/v1/billing.update" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.update({
    customerId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingUpdate } from "@useautumn/sdk/funcs/billing-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingUpdate(autumn, {
    customerId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingUpdate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.BillingUpdateRequest](../../models/billing-update-request.md)                                                                                                          | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.BillingUpdateResponse](../../models/billing-update-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## previewUpdate

Preview billing changes before updating a subscription.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="billingPreviewUpdate" method="post" path="/v1/billing.preview_update" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.previewUpdate({
    customerId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingPreviewUpdate } from "@useautumn/sdk/funcs/billing-preview-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingPreviewUpdate(autumn, {
    customerId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingPreviewUpdate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.BillingPreviewUpdateRequest](../../models/billing-preview-update-request.md)                                                                                           | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.BillingPreviewUpdateResponse](../../models/billing-preview-update-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## setupPayment

Create a setup payment session for a customer.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="billingSetupPayment" method="post" path="/v1/billing.setup_payment" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.setupPayment({
    customerId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingSetupPayment } from "@useautumn/sdk/funcs/billing-setup-payment.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingSetupPayment(autumn, {
    customerId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingSetupPayment failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.BillingSetupPaymentRequest](../../models/billing-setup-payment-request.md)                                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.BillingSetupPaymentResponse](../../models/billing-setup-payment-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |