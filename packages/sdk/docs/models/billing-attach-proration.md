# BillingAttachProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.

## Example Usage

```typescript
import { BillingAttachProration } from "@useautumn/sdk";

let value: BillingAttachProration = {
  onIncrease: "bill_immediately",
  onDecrease: "no_prorations",
};
```

## Fields

| Field                                                                     | Type                                                                      | Required                                                                  | Description                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `onIncrease`                                                              | [models.BillingAttachOnIncrease](../models/billing-attach-on-increase.md) | :heavy_check_mark:                                                        | Billing behavior when quantity increases mid-cycle.                       |
| `onDecrease`                                                              | [models.BillingAttachOnDecrease](../models/billing-attach-on-decrease.md) | :heavy_check_mark:                                                        | Credit behavior when quantity decreases mid-cycle.                        |