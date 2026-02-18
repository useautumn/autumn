# BillingAttachProration

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
| `onIncrease`                                                              | [models.BillingAttachOnIncrease](../models/billing-attach-on-increase.md) | :heavy_check_mark:                                                        | N/A                                                                       |
| `onDecrease`                                                              | [models.BillingAttachOnDecrease](../models/billing-attach-on-decrease.md) | :heavy_check_mark:                                                        | N/A                                                                       |