# PreviewUpdateResponse

OK

## Example Usage

```typescript
import { PreviewUpdateResponse } from "@useautumn/sdk";

let value: PreviewUpdateResponse = {
  customerId: "<id>",
  lineItems: [
    {
      title: "<value>",
      description: "oof despite aha psst woot well",
      amount: 1951,
    },
  ],
  total: 20,
  currency: "usd",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `customerId`                                                                                                         | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | The ID of the customer.                                                                                              |
| `lineItems`                                                                                                          | [models.PreviewUpdateLineItem](../models/preview-update-line-item.md)[]                                              | :heavy_check_mark:                                                                                                   | List of line items for the current billing period.                                                                   |
| `total`                                                                                                              | *number*                                                                                                             | :heavy_check_mark:                                                                                                   | The total amount in cents for the current billing period.                                                            |
| `currency`                                                                                                           | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | The three-letter ISO currency code (e.g., 'usd').                                                                    |
| `nextCycle`                                                                                                          | [models.PreviewUpdateNextCycle](../models/preview-update-next-cycle.md)                                              | :heavy_minus_sign:                                                                                                   | Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles. |