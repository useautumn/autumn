# BillingUpdateProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.

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
| `onIncrease`                                                              | [models.BillingUpdateOnIncrease](../models/billing-update-on-increase.md) | :heavy_check_mark:                                                        | Billing behavior when quantity increases mid-cycle.                       |
| `onDecrease`                                                              | [models.BillingUpdateOnDecrease](../models/billing-update-on-decrease.md) | :heavy_check_mark:                                                        | Credit behavior when quantity decreases mid-cycle.                        |