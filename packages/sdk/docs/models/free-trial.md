# FreeTrial

Free trial configuration. If set, new customers can try this plan before being charged.

## Example Usage

```typescript
import { FreeTrial } from "@useautumn/sdk";

let value: FreeTrial = {
  durationLength: 2887.56,
  durationType: "year",
  cardRequired: true,
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `durationLength`                                                                                             | *number*                                                                                                     | :heavy_check_mark:                                                                                           | Number of duration_type periods the trial lasts.                                                             |
| `durationType`                                                                                               | [models.PlanDurationType](../models/plan-duration-type.md)                                                   | :heavy_check_mark:                                                                                           | Unit of time for the trial duration ('day', 'month', 'year').                                                |
| `cardRequired`                                                                                               | *boolean*                                                                                                    | :heavy_check_mark:                                                                                           | Whether a payment method is required to start the trial. If true, customer will be charged after trial ends. |