# CreatePlanItemDisplay

Display text for showing this item in pricing pages.

## Example Usage

```typescript
import { CreatePlanItemDisplay } from "@useautumn/sdk";

let value: CreatePlanItemDisplay = {
  primaryText: "<value>",
};
```

## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `primaryText`                                                     | *string*                                                          | :heavy_check_mark:                                                | Main display text (e.g. '$10' or '100 messages').                 |
| `secondaryText`                                                   | *string*                                                          | :heavy_minus_sign:                                                | Secondary display text (e.g. 'per month' or 'then $0.5 per 100'). |