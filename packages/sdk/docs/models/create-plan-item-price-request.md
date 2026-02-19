# CreatePlanItemPriceRequest

Pricing for usage beyond included units. Omit for free features.

## Example Usage

```typescript
import { CreatePlanItemPriceRequest } from "@useautumn/sdk";

let value: CreatePlanItemPriceRequest = {
  interval: "year",
  billingMethod: "prepaid",
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `amount`                                                                                                     | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Price per billing_units after included usage. Either 'amount' or 'tiers' is required.                        |
| `tiers`                                                                                                      | [models.CreatePlanTierRequest](../models/create-plan-tier-request.md)[]                                      | :heavy_minus_sign:                                                                                           | Tiered pricing. Each tier's 'to' does NOT include included amount. Either 'amount' or 'tiers' is required.   |
| `interval`                                                                                                   | [models.CreatePlanItemPriceIntervalRequest](../models/create-plan-item-price-interval-request.md)            | :heavy_check_mark:                                                                                           | Billing interval. For consumable features, should match reset.interval.                                      |
| `intervalCount`                                                                                              | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Number of intervals per billing cycle. Defaults to 1.                                                        |
| `billingUnits`                                                                                               | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200). |
| `billingMethod`                                                                                              | [models.CreatePlanBillingMethodRequest](../models/create-plan-billing-method-request.md)                     | :heavy_check_mark:                                                                                           | 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.                                      |
| `maxPurchase`                                                                                                | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.                 |