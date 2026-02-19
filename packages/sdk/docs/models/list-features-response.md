# ListFeaturesResponse

OK

## Example Usage

```typescript
import { ListFeaturesResponse } from "@useautumn/sdk";

let value: ListFeaturesResponse = {
  list: [
    {
      id: "api-calls",
      name: "API Calls",
      type: "metered",
      consumable: true,
      display: {
        singular: "API call",
        plural: "API calls",
      },
      archived: false,
    },
    {
      id: "credits",
      name: "Credits",
      type: "credit_system",
      consumable: true,
      creditSchema: [
        {
          meteredFeatureId: "api-calls",
          creditCost: 1,
        },
        {
          meteredFeatureId: "image-generations",
          creditCost: 10,
        },
      ],
      display: {
        singular: "credit",
        plural: "credits",
      },
      archived: false,
    },
  ],
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `list`                                                       | [models.ListFeaturesList](../models/list-features-list.md)[] | :heavy_check_mark:                                           | N/A                                                          |