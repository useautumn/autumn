# CheckFreeTrial

## Example Usage

```typescript
import { CheckFreeTrial } from "@useautumn/sdk";

let value: CheckFreeTrial = {
  duration: "year",
  length: 5382.25,
  uniqueFingerprint: false,
  cardRequired: false,
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