# BalanceFeature

The full feature object if expanded.

## Example Usage

```typescript
import { BalanceFeature } from "@useautumn/sdk";

let value: BalanceFeature = {
  id: "<id>",
  name: "<value>",
  type: "boolean",
  consumable: true,
  archived: true,
};
```

## Fields

| Field                                                                                                                           | Type                                                                                                                            | Required                                                                                                                        | Description                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                            | *string*                                                                                                                        | :heavy_check_mark:                                                                                                              | The unique identifier for this feature, used in /check and /track calls.                                                        |
| `name`                                                                                                                          | *string*                                                                                                                        | :heavy_check_mark:                                                                                                              | Human-readable name displayed in the dashboard and billing UI.                                                                  |
| `type`                                                                                                                          | [models.BalanceType](../models/balance-type.md)                                                                                 | :heavy_check_mark:                                                                                                              | Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.      |
| `consumable`                                                                                                                    | *boolean*                                                                                                                       | :heavy_check_mark:                                                                                                              | For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage). |
| `eventNames`                                                                                                                    | *string*[]                                                                                                                      | :heavy_minus_sign:                                                                                                              | Event names that trigger this feature's balance. Allows multiple features to respond to a single event.                         |
| `creditSchema`                                                                                                                  | [models.BalanceCreditSchema](../models/balance-credit-schema.md)[]                                                              | :heavy_minus_sign:                                                                                                              | For credit_system features: maps metered features to their credit costs.                                                        |
| `display`                                                                                                                       | [models.BalanceDisplay](../models/balance-display.md)                                                                           | :heavy_minus_sign:                                                                                                              | Display names for the feature in billing UI and customer-facing components.                                                     |
| `archived`                                                                                                                      | *boolean*                                                                                                                       | :heavy_check_mark:                                                                                                              | Whether the feature is archived and hidden from the dashboard.                                                                  |