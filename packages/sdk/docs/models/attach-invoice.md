# AttachInvoice

## Example Usage

```typescript
import { AttachInvoice } from "@useautumn/sdk";

let value: AttachInvoice = {
  status: "<value>",
  stripeId: "<id>",
  total: 702.61,
  currency: "Balboa",
  hostedInvoiceUrl: "https://weird-gripper.com/",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `status`           | *string*           | :heavy_check_mark: | N/A                |
| `stripeId`         | *string*           | :heavy_check_mark: | N/A                |
| `total`            | *number*           | :heavy_check_mark: | N/A                |
| `currency`         | *string*           | :heavy_check_mark: | N/A                |
| `hostedInvoiceUrl` | *string*           | :heavy_check_mark: | N/A                |