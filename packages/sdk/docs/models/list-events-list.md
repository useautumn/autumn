# ListEventsList

## Example Usage

```typescript
import { ListEventsList } from "@useautumn/sdk";

let value: ListEventsList = {
  id: "<id>",
  timestamp: 392.41,
  featureId: "<id>",
  customerId: "<id>",
  value: 7636.8,
  properties: {},
};
```

## Fields

| Field                                                              | Type                                                               | Required                                                           | Description                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `id`                                                               | *string*                                                           | :heavy_check_mark:                                                 | Event ID (KSUID)                                                   |
| `timestamp`                                                        | *number*                                                           | :heavy_check_mark:                                                 | Event timestamp (epoch milliseconds)                               |
| `featureId`                                                        | *string*                                                           | :heavy_check_mark:                                                 | ID of the feature that the event belongs to                        |
| `customerId`                                                       | *string*                                                           | :heavy_check_mark:                                                 | Customer identifier                                                |
| `value`                                                            | *number*                                                           | :heavy_check_mark:                                                 | Event value/count                                                  |
| `properties`                                                       | [models.ListEventsProperties](../models/list-events-properties.md) | :heavy_check_mark:                                                 | Event properties (JSONB)                                           |