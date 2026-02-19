# AggregateEventsResponse

OK

## Example Usage

```typescript
import { AggregateEventsResponse } from "@useautumn/sdk";

let value: AggregateEventsResponse = {
  list: [
    {
      period: 1762905600000,
      values: {
        "messages": 10,
        "sessions": 3,
      },
    },
    {
      period: 1762992000000,
      values: {
        "messages": 3,
        "sessions": 12,
      },
    },
  ],
  total: {
    "messages": {
      count: 2,
      sum: 13,
    },
    "sessions": {
      count: 2,
      sum: 15,
    },
  },
};
```

## Fields

| Field                                                                               | Type                                                                                | Required                                                                            | Description                                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `list`                                                                              | [models.AggregateEventsList](../models/aggregate-events-list.md)[]                  | :heavy_check_mark:                                                                  | Array of time periods with aggregated values                                        |
| `total`                                                                             | Record<string, [models.Total](../models/total.md)>                                  | :heavy_check_mark:                                                                  | Total aggregations per feature. Keys are feature IDs, values contain count and sum. |