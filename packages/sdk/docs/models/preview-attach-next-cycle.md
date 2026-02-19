# PreviewAttachNextCycle

Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.

## Example Usage

```typescript
import { PreviewAttachNextCycle } from "@useautumn/sdk";

let value: PreviewAttachNextCycle = {
  startsAt: 8800.78,
  total: 1852.37,
};
```

## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `startsAt`                                                        | *number*                                                          | :heavy_check_mark:                                                | Unix timestamp (milliseconds) when the next billing cycle starts. |
| `total`                                                           | *number*                                                          | :heavy_check_mark:                                                | The total amount in cents for the next cycle.                     |