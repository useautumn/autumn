# PreviewAttachLineItem

## Example Usage

```typescript
import { PreviewAttachLineItem } from "@useautumn/sdk";

let value: PreviewAttachLineItem = {
  title: "<value>",
  description: "if brr boo",
  amount: 4318.62,
};
```

## Fields

| Field                                                                                   | Type                                                                                    | Required                                                                                | Description                                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `title`                                                                                 | *string*                                                                                | :heavy_check_mark:                                                                      | The title of the line item.                                                             |
| `description`                                                                           | *string*                                                                                | :heavy_check_mark:                                                                      | A detailed description of the line item.                                                |
| `amount`                                                                                | *number*                                                                                | :heavy_check_mark:                                                                      | The amount in cents for this line item.                                                 |
| `discounts`                                                                             | [models.PreviewAttachDiscountResponse](../models/preview-attach-discount-response.md)[] | :heavy_minus_sign:                                                                      | List of discounts applied to this line item.                                            |