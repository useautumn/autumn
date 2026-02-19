# PreviewUpdateItemPrice

Pricing for usage beyond included units. Omit for free features.

## Example Usage

```typescript
import { PreviewUpdateItemPrice } from "@useautumn/sdk";

let value: PreviewUpdateItemPrice = {
  interval: "one_off",
  billingMethod: "usage_based",
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `amount`                                                                                                     | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Price per billing_units after included usage. Either 'amount' or 'tiers' is required.                        |
| `tiers`                                                                                                      | [models.PreviewUpdateTier](../models/preview-update-tier.md)[]                                               | :heavy_minus_sign:                                                                                           | Tiered pricing. Each tier's 'to' does NOT include included amount. Either 'amount' or 'tiers' is required.   |
| `interval`                                                                                                   | [models.PreviewUpdateItemPriceInterval](../models/preview-update-item-price-interval.md)                     | :heavy_check_mark:                                                                                           | Billing interval. For consumable features, should match reset.interval.                                      |
| `intervalCount`                                                                                              | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Number of intervals per billing cycle. Defaults to 1.                                                        |
| `billingUnits`                                                                                               | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200). |
| `billingMethod`                                                                                              | [models.PreviewUpdateBillingMethod](../models/preview-update-billing-method.md)                              | :heavy_check_mark:                                                                                           | 'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.                                      |
| `maxPurchase`                                                                                                | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.                 |