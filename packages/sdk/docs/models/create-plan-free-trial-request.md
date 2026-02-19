# CreatePlanFreeTrialRequest

Free trial configuration. Customers can try this plan before being charged.

## Example Usage

```typescript
import { CreatePlanFreeTrialRequest } from "@useautumn/sdk";

let value: CreatePlanFreeTrialRequest = {
  durationLength: 6103.01,
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `durationLength`                                                                       | *number*                                                                               | :heavy_check_mark:                                                                     | Number of duration_type periods the trial lasts.                                       |
| `durationType`                                                                         | [models.CreatePlanDurationTypeRequest](../models/create-plan-duration-type-request.md) | :heavy_minus_sign:                                                                     | Unit of time for the trial ('day', 'month', 'year').                                   |
| `cardRequired`                                                                         | *boolean*                                                                              | :heavy_minus_sign:                                                                     | If true, payment method required to start trial. Customer is charged after trial ends. |