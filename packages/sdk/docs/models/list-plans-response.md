# ListPlansResponse

OK

## Example Usage

```typescript
import { ListPlansResponse } from "@useautumn/sdk";

let value: ListPlansResponse = {
  list: [
    {
      id: "pro",
      name: "Pro Plan",
      description: null,
      group: null,
      version: 1,
      addOn: true,
      autoEnable: true,
      price: {
        amount: 10,
        interval: "month",
        display: {
          primaryText: "<value>",
        },
      },
      items: [
        {
          featureId: "<id>",
          included: 100,
          unlimited: false,
          reset: {
            interval: "month",
          },
          price: {
            amount: 0.5,
            interval: "month",
            billingUnits: 6959.08,
            billingMethod: "prepaid",
            maxPurchase: null,
          },
          display: {
            primaryText: "<value>",
          },
        },
        {
          featureId: "<id>",
          included: 0,
          unlimited: false,
          reset: null,
          price: {
            amount: 10,
            interval: "month",
            billingUnits: 2384.07,
            billingMethod: "prepaid",
            maxPurchase: 2561.91,
          },
          display: {
            primaryText: "<value>",
          },
        },
      ],
      createdAt: 9164.93,
      env: "sandbox",
      archived: false,
      baseVariantId: "<id>",
    },
  ],
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `list`                                                 | [models.ListPlansList](../models/list-plans-list.md)[] | :heavy_check_mark:                                     | N/A                                                    |