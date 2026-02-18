# BalancesCheckFreeTrial

## Example Usage

```typescript
import { BalancesCheckFreeTrial } from "@useautumn/sdk";

let value: BalancesCheckFreeTrial = {
  duration: "day",
  length: 8856.14,
  uniqueFingerprint: false,
  cardRequired: true,
};
```

## Fields

| Field                                                                                                                                                 | Type                                                                                                                                                  | Required                                                                                                                                              | Description                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duration`                                                                                                                                            | [models.FreeTrialDuration](../models/free-trial-duration.md)                                                                                          | :heavy_check_mark:                                                                                                                                    | The duration type of the free trial                                                                                                                   |
| `length`                                                                                                                                              | *number*                                                                                                                                              | :heavy_check_mark:                                                                                                                                    | The length of the duration type specified                                                                                                             |
| `uniqueFingerprint`                                                                                                                                   | *boolean*                                                                                                                                             | :heavy_check_mark:                                                                                                                                    | Whether the free trial is limited to one per customer fingerprint                                                                                     |
| `cardRequired`                                                                                                                                        | *boolean*                                                                                                                                             | :heavy_check_mark:                                                                                                                                    | Whether the free trial requires a card. If false, the customer can attach the product without going through a checkout flow or having a card on file. |
| `trialAvailable`                                                                                                                                      | *boolean*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                    | Used in customer context. Whether the free trial is available for the customer if they were to attach the product.                                    |