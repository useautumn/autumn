# BillingUpdateCustomize

Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both.

## Example Usage

```typescript
import { BillingUpdateCustomize } from "@useautumn/sdk";

let value: BillingUpdateCustomize = {};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `price`                                                        | [models.BillingUpdatePrice](../models/billing-update-price.md) | :heavy_minus_sign:                                             | N/A                                                            |
| `items`                                                        | [models.BillingUpdateItem](../models/billing-update-item.md)[] | :heavy_minus_sign:                                             | N/A                                                            |