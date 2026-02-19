# OpenCustomerPortalParams

## Example Usage

```typescript
import { OpenCustomerPortalParams } from "@useautumn/sdk";

let value: OpenCustomerPortalParams = {
  customerId: "cus_123",
  returnUrl: "https://useautumn.com",
};
```

## Fields

| Field                                                                                   | Type                                                                                    | Required                                                                                | Description                                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `customerId`                                                                            | *string*                                                                                | :heavy_check_mark:                                                                      | The ID of the customer to open the billing portal for.                                  |
| `configurationId`                                                                       | *string*                                                                                | :heavy_minus_sign:                                                                      | Stripe billing portal configuration ID. Create configurations in your Stripe dashboard. |
| `returnUrl`                                                                             | *string*                                                                                | :heavy_minus_sign:                                                                      | URL to redirect to when back button is clicked in the billing portal                    |