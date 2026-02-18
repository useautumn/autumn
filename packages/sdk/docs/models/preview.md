# Preview

## Example Usage

```typescript
import { Preview } from "@useautumn/sdk";

let value: Preview = {
  scenario: "feature_flag",
  title: "<value>",
  message: "<value>",
  featureId: "<id>",
  featureName: "<value>",
  products: [
    {
      id: "<id>",
      name: "<value>",
      group: "<value>",
      env: "live",
      isAddOn: true,
      isDefault: true,
      archived: false,
      version: 9180.41,
      createdAt: 4832.76,
      items: [],
      freeTrial: {
        duration: "year",
        length: 353.73,
        uniqueFingerprint: true,
        cardRequired: true,
      },
      baseVariantId: "<id>",
    },
  ],
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `scenario`                                                           | [models.BalancesCheckScenario](../models/balances-check-scenario.md) | :heavy_check_mark:                                                   | N/A                                                                  |
| `title`                                                              | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `message`                                                            | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `featureId`                                                          | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `featureName`                                                        | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `products`                                                           | [models.Product](../models/product.md)[]                             | :heavy_check_mark:                                                   | N/A                                                                  |