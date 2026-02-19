# BillingUpdateFreeTrial

## Example Usage

```typescript
import { BillingUpdateFreeTrial } from "@useautumn/sdk";

let value: BillingUpdateFreeTrial = {
  durationLength: 5776.39,
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `durationLength`                                                                       | *number*                                                                               | :heavy_check_mark:                                                                     | Number of duration_type periods the trial lasts.                                       |
| `durationType`                                                                         | [models.BillingUpdateDurationType](../models/billing-update-duration-type.md)          | :heavy_minus_sign:                                                                     | Unit of time for the trial ('day', 'month', 'year').                                   |
| `cardRequired`                                                                         | *boolean*                                                                              | :heavy_minus_sign:                                                                     | If true, payment method required to start trial. Customer is charged after trial ends. |