# CreatePlanFeature

The full feature object if expanded.

## Example Usage

```typescript
import { CreatePlanFeature } from "@useautumn/sdk";

let value: CreatePlanFeature = {
  id: "<id>",
  type: "continuous_use",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                                                                                 | *string*                                                                             | :heavy_check_mark:                                                                   | The ID of the feature, used to refer to it in other API calls like /track or /check. |
| `name`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | The name of the feature.                                                             |
| `type`                                                                               | [models.CreatePlanType](../models/create-plan-type.md)                               | :heavy_check_mark:                                                                   | The type of the feature                                                              |
| `display`                                                                            | [models.CreatePlanFeatureDisplay](../models/create-plan-feature-display.md)          | :heavy_minus_sign:                                                                   | Singular and plural display names for the feature.                                   |
| `creditSchema`                                                                       | [models.CreatePlanCreditSchema](../models/create-plan-credit-schema.md)[]            | :heavy_minus_sign:                                                                   | Credit cost schema for credit system features.                                       |
| `archived`                                                                           | *boolean*                                                                            | :heavy_minus_sign:                                                                   | Whether or not the feature is archived.                                              |