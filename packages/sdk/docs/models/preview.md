# Preview

Upgrade/upsell information when access is denied. Only present if with_preview was true and allowed is false.

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

| Field                                                                                                                                                  | Type                                                                                                                                                   | Required                                                                                                                                               | Description                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scenario`                                                                                                                                             | [models.CheckScenario](../models/check-scenario.md)                                                                                                    | :heavy_check_mark:                                                                                                                                     | The reason access was denied. 'usage_limit' means the customer exceeded their balance, 'feature_flag' means the feature is not included in their plan. |
| `title`                                                                                                                                                | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | A title suitable for displaying in a paywall or upgrade modal.                                                                                         |
| `message`                                                                                                                                              | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | A message explaining why access was denied.                                                                                                            |
| `featureId`                                                                                                                                            | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | The ID of the feature that was checked.                                                                                                                |
| `featureName`                                                                                                                                          | *string*                                                                                                                                               | :heavy_check_mark:                                                                                                                                     | The display name of the feature.                                                                                                                       |
| `products`                                                                                                                                             | [models.Product](../models/product.md)[]                                                                                                               | :heavy_check_mark:                                                                                                                                     | Products that would grant access to this feature. Use to display upgrade options.                                                                      |