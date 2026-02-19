# Product

## Example Usage

```typescript
import { Product } from "@useautumn/sdk";

let value: Product = {
  id: "<id>",
  name: "<value>",
  group: "<value>",
  env: "live",
  isAddOn: true,
  isDefault: false,
  archived: false,
  version: 7405.63,
  createdAt: 7443.76,
  items: [],
  freeTrial: {
    duration: "year",
    length: 353.73,
    uniqueFingerprint: true,
    cardRequired: true,
  },
  baseVariantId: "<id>",
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `id`                                                                           | *string*                                                                       | :heavy_check_mark:                                                             | The ID of the product you set when creating the product                        |
| `name`                                                                         | *string*                                                                       | :heavy_check_mark:                                                             | The name of the product                                                        |
| `group`                                                                        | *string*                                                                       | :heavy_check_mark:                                                             | Product group which this product belongs to                                    |
| `env`                                                                          | [models.CheckEnv](../models/check-env.md)                                      | :heavy_check_mark:                                                             | The environment of the product                                                 |
| `isAddOn`                                                                      | *boolean*                                                                      | :heavy_check_mark:                                                             | Whether the product is an add-on and can be purchased alongside other products |
| `isDefault`                                                                    | *boolean*                                                                      | :heavy_check_mark:                                                             | Whether the product is the default product                                     |
| `archived`                                                                     | *boolean*                                                                      | :heavy_check_mark:                                                             | Whether this product has been archived and is no longer available              |
| `version`                                                                      | *number*                                                                       | :heavy_check_mark:                                                             | The current version of the product                                             |
| `createdAt`                                                                    | *number*                                                                       | :heavy_check_mark:                                                             | The timestamp of when the product was created in milliseconds since epoch      |
| `items`                                                                        | [models.CheckItem](../models/check-item.md)[]                                  | :heavy_check_mark:                                                             | Array of product items that define the product's features and pricing          |
| `freeTrial`                                                                    | [models.CheckFreeTrial](../models/check-free-trial.md)                         | :heavy_check_mark:                                                             | Free trial configuration for this product, if available                        |
| `baseVariantId`                                                                | *string*                                                                       | :heavy_check_mark:                                                             | ID of the base variant this product is derived from                            |
| `scenario`                                                                     | [models.ProductScenario](../models/product-scenario.md)                        | :heavy_minus_sign:                                                             | Scenario for when this product is used in attach flows                         |
| `properties`                                                                   | [models.CheckProperties](../models/check-properties.md)                        | :heavy_minus_sign:                                                             | N/A                                                                            |