# CreatePlanProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.

## Example Usage

```typescript
import { CreatePlanProration } from "@useautumn/sdk";

let value: CreatePlanProration = {
  onIncrease: "prorate_next_cycle",
  onDecrease: "none",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `onIncrease`                                                        | [models.CreatePlanOnIncrease](../models/create-plan-on-increase.md) | :heavy_check_mark:                                                  | Billing behavior when quantity increases mid-cycle.                 |
| `onDecrease`                                                        | [models.CreatePlanOnDecrease](../models/create-plan-on-decrease.md) | :heavy_check_mark:                                                  | Credit behavior when quantity decreases mid-cycle.                  |