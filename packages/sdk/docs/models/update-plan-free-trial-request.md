# UpdatePlanFreeTrialRequest

## Example Usage

```typescript
import { UpdatePlanFreeTrialRequest } from "@useautumn/sdk";

let value: UpdatePlanFreeTrialRequest = {
  durationLength: 6946,
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `durationLength`                                                                       | *number*                                                                               | :heavy_check_mark:                                                                     | Number of duration_type periods the trial lasts.                                       |
| `durationType`                                                                         | [models.UpdatePlanDurationTypeRequest](../models/update-plan-duration-type-request.md) | :heavy_minus_sign:                                                                     | Unit of time for the trial ('day', 'month', 'year').                                   |
| `cardRequired`                                                                         | *boolean*                                                                              | :heavy_minus_sign:                                                                     | If true, payment method required to start trial. Customer is charged after trial ends. |