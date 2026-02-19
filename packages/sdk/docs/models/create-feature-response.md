# CreateFeatureResponse

OK

## Example Usage

```typescript
import { CreateFeatureResponse } from "@useautumn/sdk";

let value: CreateFeatureResponse = {
  id: "api-calls",
  name: "API Calls",
  type: "metered",
  consumable: true,
  display: {
    singular: "API call",
    plural: "API calls",
  },
  archived: false,
};
```

## Fields

| Field                                                                                                                           | Type                                                                                                                            | Required                                                                                                                        | Description                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                            | *string*                                                                                                                        | :heavy_check_mark:                                                                                                              | The unique identifier for this feature, used in /check and /track calls.                                                        |
| `name`                                                                                                                          | *string*                                                                                                                        | :heavy_check_mark:                                                                                                              | Human-readable name displayed in the dashboard and billing UI.                                                                  |
| `type`                                                                                                                          | [models.CreateFeatureTypeResponse](../models/create-feature-type-response.md)                                                   | :heavy_check_mark:                                                                                                              | Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.      |
| `consumable`                                                                                                                    | *boolean*                                                                                                                       | :heavy_check_mark:                                                                                                              | For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage). |
| `eventNames`                                                                                                                    | *string*[]                                                                                                                      | :heavy_minus_sign:                                                                                                              | Event names that trigger this feature's balance. Allows multiple features to respond to a single event.                         |
| `creditSchema`                                                                                                                  | [models.CreateFeatureCreditSchemaResponse](../models/create-feature-credit-schema-response.md)[]                                | :heavy_minus_sign:                                                                                                              | For credit_system features: maps metered features to their credit costs.                                                        |
| `display`                                                                                                                       | [models.CreateFeatureDisplayResponse](../models/create-feature-display-response.md)                                             | :heavy_minus_sign:                                                                                                              | Display names for the feature in billing UI and customer-facing components.                                                     |
| `archived`                                                                                                                      | *boolean*                                                                                                                       | :heavy_check_mark:                                                                                                              | Whether the feature is archived and hidden from the dashboard.                                                                  |