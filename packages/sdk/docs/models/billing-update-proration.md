# BillingUpdateProration

## Example Usage

```typescript
import { BillingUpdateProration } from "@useautumn/sdk";

let value: BillingUpdateProration = {
  onIncrease: "prorate_immediately",
  onDecrease: "prorate_next_cycle",
};
```

## Fields

| Field                                                                     | Type                                                                      | Required                                                                  | Description                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `onIncrease`                                                              | [models.BillingUpdateOnIncrease](../models/billing-update-on-increase.md) | :heavy_check_mark:                                                        | N/A                                                                       |
| `onDecrease`                                                              | [models.BillingUpdateOnDecrease](../models/billing-update-on-decrease.md) | :heavy_check_mark:                                                        | N/A                                                                       |