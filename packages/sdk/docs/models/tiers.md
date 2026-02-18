# Tiers

## Example Usage

```typescript
import { Tiers } from "@useautumn/sdk";

let value: Tiers = {
  to: "<value>",
  amount: 5676,
};
```

## Fields

| Field                                        | Type                                         | Required                                     | Description                                  |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `to`                                         | *models.TiersTo*                             | :heavy_check_mark:                           | The maximum amount of usage for this tier.   |
| `amount`                                     | *number*                                     | :heavy_check_mark:                           | The price of the product item for this tier. |