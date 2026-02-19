# EventsAggregateParams

## Example Usage

```typescript
import { EventsAggregateParams } from "@useautumn/sdk";

let value: EventsAggregateParams = {
  customerId: "cus_123",
  featureId: "api_calls",
  range: "30d",
};
```

## Fields

| Field                                                                                                                 | Type                                                                                                                  | Required                                                                                                              | Description                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `customerId`                                                                                                          | *string*                                                                                                              | :heavy_check_mark:                                                                                                    | Customer ID to aggregate events for                                                                                   |
| `featureId`                                                                                                           | *models.AggregateEventsFeatureId*                                                                                     | :heavy_check_mark:                                                                                                    | Feature ID(s) to aggregate events for                                                                                 |
| `groupBy`                                                                                                             | *string*                                                                                                              | :heavy_minus_sign:                                                                                                    | Property to group events by. If provided, each key in the response will be an object with distinct groups as the keys |
| `range`                                                                                                               | [models.Range](../models/range.md)                                                                                    | :heavy_minus_sign:                                                                                                    | Time range to aggregate events for. Either range or custom_range must be provided                                     |
| `binSize`                                                                                                             | [models.BinSize](../models/bin-size.md)                                                                               | :heavy_minus_sign:                                                                                                    | Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day                        |
| `customRange`                                                                                                         | [models.AggregateEventsCustomRange](../models/aggregate-events-custom-range.md)                                       | :heavy_minus_sign:                                                                                                    | Custom time range to aggregate events for. If provided, range must not be provided                                    |