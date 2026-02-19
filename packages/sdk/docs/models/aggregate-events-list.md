# AggregateEventsList

## Example Usage

```typescript
import { AggregateEventsList } from "@useautumn/sdk";

let value: AggregateEventsList = {
  period: 1600.31,
  values: {
    "key": 8171.94,
  },
};
```

## Fields

| Field                                                                                                       | Type                                                                                                        | Required                                                                                                    | Description                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `period`                                                                                                    | *number*                                                                                                    | :heavy_check_mark:                                                                                          | Unix timestamp (epoch ms) for this time period                                                              |
| `values`                                                                                                    | Record<string, *number*>                                                                                    | :heavy_check_mark:                                                                                          | Aggregated values per feature: { [featureId]: number }                                                      |
| `groupedValues`                                                                                             | Record<string, Record<string, *number*>>                                                                    | :heavy_minus_sign:                                                                                          | Values broken down by group (only present when group_by is used): { [featureId]: { [groupValue]: number } } |