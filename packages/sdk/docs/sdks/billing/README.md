# Billing

## Overview

### Available Operations

* [attach](#attach) - Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

Use this endpoint to subscribe a customer to a plan, upgrade/downgrade between plans, or add an add-on product.

@example
```typescript
// Attach a plan to a customer
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@example
```typescript
// Attach with a free trial
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan", freeTrial: {"durationLength":14,"durationType":"day"} });
```

@example
```typescript
// Attach with custom pricing
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan", customize: {"price":{"amount":4900,"interval":"month"}} });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param planId - The ID of the plan.
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param discounts - List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code. (optional)
@param successUrl - URL to redirect to after successful checkout. (optional)
@param newBillingSubscription - Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one. (optional)
@param planSchedule - When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled. (optional)

@returns A billing response with customer ID, invoice details, and payment URL (if checkout required).
* [previewAttach](#previewattach) - Previews the billing changes that would occur when attaching a plan, without actually making any changes.

Use this endpoint to show customers what they will be charged before confirming a subscription change.

@example
```typescript
// Preview attaching a plan
const response = await client.billing.previewAttach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param planId - The ID of the plan.
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param discounts - List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code. (optional)
@param successUrl - URL to redirect to after successful checkout. (optional)
@param newBillingSubscription - Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one. (optional)
@param planSchedule - When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled. (optional)

@returns A preview response with line items, totals, and effective dates for the proposed changes.
* [update](#update) - Updates an existing subscription. Use to modify feature quantities, cancel, or change plan configuration.

Use this endpoint to update prepaid quantities, cancel a subscription (immediately or at end of cycle), or modify subscription settings.

@example
```typescript
// Update prepaid feature quantity
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", featureQuantities: [{"featureId":"seats","quantity":10}] });
```

@example
```typescript
// Cancel a subscription at end of billing cycle
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", cancelAction: "cancel_end_of_cycle" });
```

@example
```typescript
// Uncancel a subscription at the end of the billing cycle
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", cancelAction: "uncancel" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param cancelAction - Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation. (optional)

@returns A billing response with customer ID, invoice details, and payment URL (if next action is required).
* [previewUpdate](#previewupdate) - Previews the billing changes that would occur when updating a subscription, without actually making any changes.

Use this endpoint to show customers prorated charges or refunds before confirming subscription modifications.

@example
```typescript
// Preview updating seat quantity
const response = await client.billing.previewUpdate({ customerId: "cus_123", planId: "pro_plan", featureQuantities: [{"featureId":"seats","quantity":15}] });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param cancelAction - Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation. (optional)

@returns A preview response with line items showing prorated charges or credits for the proposed changes.
* [openCustomerPortal](#opencustomerportal) - Create a billing portal session for a customer to manage their subscription.
* [setupPayment](#setuppayment) - Create a payment setup session for a customer to add or update their payment method.

## attach

Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

Use this endpoint to subscribe a customer to a plan, upgrade/downgrade between plans, or add an add-on product.

@example
```typescript
// Attach a plan to a customer
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@example
```typescript
// Attach with a free trial
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan", freeTrial: {"durationLength":14,"durationType":"day"} });
```

@example
```typescript
// Attach with custom pricing
const response = await client.billing.attach({ customerId: "cus_123", planId: "pro_plan", customize: {"price":{"amount":4900,"interval":"month"}} });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param planId - The ID of the plan.
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param discounts - List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code. (optional)
@param successUrl - URL to redirect to after successful checkout. (optional)
@param newBillingSubscription - Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one. (optional)
@param planSchedule - When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled. (optional)

@returns A billing response with customer ID, invoice details, and payment URL (if checkout required).

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
    customerId: "cus_123",
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
import { billingAttach } from "@useautumn/sdk/funcs/billing-attach.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingAttach(autumn, {
    customerId: "cus_123",
    planId: "pro_plan",
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
| `request`                                                                                                                                                                      | [models.AttachParams](../../models/attach-params.md)                                                                                                                           | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
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

Previews the billing changes that would occur when attaching a plan, without actually making any changes.

Use this endpoint to show customers what they will be charged before confirming a subscription change.

@example
```typescript
// Preview attaching a plan
const response = await client.billing.previewAttach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param planId - The ID of the plan.
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param discounts - List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code. (optional)
@param successUrl - URL to redirect to after successful checkout. (optional)
@param newBillingSubscription - Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one. (optional)
@param planSchedule - When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled. (optional)

@returns A preview response with line items, totals, and effective dates for the proposed changes.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="previewAttach" method="post" path="/v1/billing.preview_attach" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.previewAttach({
    customerId: "cus_123",
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
import { billingPreviewAttach } from "@useautumn/sdk/funcs/billing-preview-attach.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingPreviewAttach(autumn, {
    customerId: "cus_123",
    planId: "pro_plan",
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
| `request`                                                                                                                                                                      | [models.PreviewAttachParams](../../models/preview-attach-params.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.PreviewAttachResponse](../../models/preview-attach-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing subscription. Use to modify feature quantities, cancel, or change plan configuration.

Use this endpoint to update prepaid quantities, cancel a subscription (immediately or at end of cycle), or modify subscription settings.

@example
```typescript
// Update prepaid feature quantity
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", featureQuantities: [{"featureId":"seats","quantity":10}] });
```

@example
```typescript
// Cancel a subscription at end of billing cycle
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", cancelAction: "cancel_end_of_cycle" });
```

@example
```typescript
// Uncancel a subscription at the end of the billing cycle
const response = await client.billing.update({ customerId: "cus_123", planId: "pro_plan", cancelAction: "uncancel" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param cancelAction - Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation. (optional)

@returns A billing response with customer ID, invoice details, and payment URL (if next action is required).

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
    customerId: "cus_123",
    planId: "pro_plan",
    featureQuantities: [
      {
        featureId: "seats",
        quantity: 10,
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
import { billingUpdate } from "@useautumn/sdk/funcs/billing-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingUpdate(autumn, {
    customerId: "cus_123",
    planId: "pro_plan",
    featureQuantities: [
      {
        featureId: "seats",
        quantity: 10,
      },
    ],
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
| `request`                                                                                                                                                                      | [models.UpdateSubscriptionParams](../../models/update-subscription-params.md)                                                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
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

Previews the billing changes that would occur when updating a subscription, without actually making any changes.

Use this endpoint to show customers prorated charges or refunds before confirming subscription modifications.

@example
```typescript
// Preview updating seat quantity
const response = await client.billing.previewUpdate({ customerId: "cus_123", planId: "pro_plan", featureQuantities: [{"featureId":"seats","quantity":15}] });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param freeTrial - Override the plan's default free trial. Pass an object to set a custom trial, or null to remove the trial entirely. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
@param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
@param billingBehavior - How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle. (optional)
@param cancelAction - Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation. (optional)

@returns A preview response with line items showing prorated charges or credits for the proposed changes.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="previewUpdate" method="post" path="/v1/billing.preview_update" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.previewUpdate({
    customerId: "cus_123",
    planId: "pro_plan",
    featureQuantities: [
      {
        featureId: "seats",
        quantity: 15,
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
import { billingPreviewUpdate } from "@useautumn/sdk/funcs/billing-preview-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingPreviewUpdate(autumn, {
    customerId: "cus_123",
    planId: "pro_plan",
    featureQuantities: [
      {
        featureId: "seats",
        quantity: 15,
      },
    ],
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
| `request`                                                                                                                                                                      | [models.PreviewUpdateParams](../../models/preview-update-params.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.PreviewUpdateResponse](../../models/preview-update-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## openCustomerPortal

Create a billing portal session for a customer to manage their subscription.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="openCustomerPortal" method="post" path="/v1/billing.open_customer_portal" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.openCustomerPortal({
    customerId: "cus_123",
    returnUrl: "https://useautumn.com",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { billingOpenCustomerPortal } from "@useautumn/sdk/funcs/billing-open-customer-portal.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await billingOpenCustomerPortal(autumn, {
    customerId: "cus_123",
    returnUrl: "https://useautumn.com",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("billingOpenCustomerPortal failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.OpenCustomerPortalParams](../../models/open-customer-portal-params.md)                                                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.OpenCustomerPortalResponse](../../models/open-customer-portal-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## setupPayment

Create a payment setup session for a customer to add or update their payment method.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="setupPayment" method="post" path="/v1/billing.setup_payment" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.billing.setupPayment({
    customerId: "cus_123",
    successUrl: "https://example.com/account/billing",
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
    customerId: "cus_123",
    successUrl: "https://example.com/account/billing",
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
| `request`                                                                                                                                                                      | [models.SetupPaymentParams](../../models/setup-payment-params.md)                                                                                                              | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.SetupPaymentResponse](../../models/setup-payment-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |