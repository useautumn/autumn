# DeleteCustomerParams

## Example Usage

```typescript
import { DeleteCustomerParams } from "@useautumn/sdk";

let value: DeleteCustomerParams = {
  customerId: "cus_123",
};
```

## Fields

| Field                                         | Type                                          | Required                                      | Description                                   |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `customerId`                                  | *string*                                      | :heavy_check_mark:                            | ID of the customer to delete                  |
| `deleteInStripe`                              | *boolean*                                     | :heavy_minus_sign:                            | Whether to also delete the customer in Stripe |