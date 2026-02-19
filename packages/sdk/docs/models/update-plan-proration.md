# UpdatePlanProration

Proration settings for prepaid features. Controls mid-cycle quantity change billing.

## Example Usage

```typescript
import { UpdatePlanProration } from "@useautumn/sdk";

let value: UpdatePlanProration = {
  onIncrease: "prorate_immediately",
  onDecrease: "none",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `onIncrease`                                                        | [models.UpdatePlanOnIncrease](../models/update-plan-on-increase.md) | :heavy_check_mark:                                                  | Billing behavior when quantity increases mid-cycle.                 |
| `onDecrease`                                                        | [models.UpdatePlanOnDecrease](../models/update-plan-on-decrease.md) | :heavy_check_mark:                                                  | Credit behavior when quantity decreases mid-cycle.                  |