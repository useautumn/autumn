# BillingUpdateRequiredAction

Details about any action required to complete the payment. Present when the payment could not be processed automatically.

## Example Usage

```typescript
import { BillingUpdateRequiredAction } from "@useautumn/sdk";

let value: BillingUpdateRequiredAction = {
  code: "3ds_required",
  reason: "<value>",
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `code`                                                       | [models.BillingUpdateCode](../models/billing-update-code.md) | :heavy_check_mark:                                           | The type of action required to complete the payment.         |
| `reason`                                                     | *string*                                                     | :heavy_check_mark:                                           | A human-readable explanation of why this action is required. |