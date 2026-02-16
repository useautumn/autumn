# AttachFeature

## Example Usage

```typescript
import { AttachFeature } from "@useautumn/sdk";

let value: AttachFeature = {
  id: "<id>",
  type: "single_use",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                                                                                 | *string*                                                                             | :heavy_check_mark:                                                                   | The ID of the feature, used to refer to it in other API calls like /track or /check. |
| `name`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | The name of the feature.                                                             |
| `type`                                                                               | [models.AttachFeatureType](../models/attach-feature-type.md)                         | :heavy_check_mark:                                                                   | The type of the feature                                                              |
| `display`                                                                            | [models.AttachFeatureDisplay](../models/attach-feature-display.md)                   | :heavy_minus_sign:                                                                   | Singular and plural display names for the feature.                                   |
| `creditSchema`                                                                       | [models.AttachCreditSchema](../models/attach-credit-schema.md)[]                     | :heavy_minus_sign:                                                                   | Credit cost schema for credit system features.                                       |
| `archived`                                                                           | *boolean*                                                                            | :heavy_minus_sign:                                                                   | Whether or not the feature is archived.                                              |