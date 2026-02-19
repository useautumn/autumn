# EventsListParams

## Example Usage

```typescript
import { EventsListParams } from "@useautumn/sdk";

let value: EventsListParams = {
  limit: 50,
  customerId: "cus_123",
};
```

## Fields

| Field                                                                 | Type                                                                  | Required                                                              | Description                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `offset`                                                              | *number*                                                              | :heavy_minus_sign:                                                    | Number of items to skip                                               |
| `limit`                                                               | *number*                                                              | :heavy_minus_sign:                                                    | Number of items to return. Default 100, max 1000.                     |
| `customerId`                                                          | *string*                                                              | :heavy_minus_sign:                                                    | Filter events by customer ID                                          |
| `featureId`                                                           | *models.ListEventsFeatureId*                                          | :heavy_minus_sign:                                                    | Filter by specific feature ID(s)                                      |
| `customRange`                                                         | [models.ListEventsCustomRange](../models/list-events-custom-range.md) | :heavy_minus_sign:                                                    | Filter events by time range                                           |