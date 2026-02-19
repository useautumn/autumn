# PreviewAttachResponse

OK

## Example Usage

```typescript
import { PreviewAttachResponse } from "@useautumn/sdk";

let value: PreviewAttachResponse = {
  customerId: "<id>",
  lineItems: [],
  total: 20,
  currency: "usd",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `customerId`                                                                                                         | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | The ID of the customer.                                                                                              |
| `lineItems`                                                                                                          | [models.PreviewAttachLineItem](../models/preview-attach-line-item.md)[]                                              | :heavy_check_mark:                                                                                                   | List of line items for the current billing period.                                                                   |
| `total`                                                                                                              | *number*                                                                                                             | :heavy_check_mark:                                                                                                   | The total amount in cents for the current billing period.                                                            |
| `currency`                                                                                                           | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | The three-letter ISO currency code (e.g., 'usd').                                                                    |
| `nextCycle`                                                                                                          | [models.PreviewAttachNextCycle](../models/preview-attach-next-cycle.md)                                              | :heavy_minus_sign:                                                                                                   | Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles. |