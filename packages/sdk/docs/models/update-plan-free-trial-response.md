# UpdatePlanFreeTrialResponse

Free trial configuration. If set, new customers can try this plan before being charged.

## Example Usage

```typescript
import { UpdatePlanFreeTrialResponse } from "@useautumn/sdk";

let value: UpdatePlanFreeTrialResponse = {
  durationLength: 2586.93,
  durationType: "year",
  cardRequired: false,
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `durationLength`                                                                                             | *number*                                                                                                     | :heavy_check_mark:                                                                                           | Number of duration_type periods the trial lasts.                                                             |
| `durationType`                                                                                               | [models.UpdatePlanDurationTypeResponse](../models/update-plan-duration-type-response.md)                     | :heavy_check_mark:                                                                                           | Unit of time for the trial duration ('day', 'month', 'year').                                                |
| `cardRequired`                                                                                               | *boolean*                                                                                                    | :heavy_check_mark:                                                                                           | Whether a payment method is required to start the trial. If true, customer will be charged after trial ends. |