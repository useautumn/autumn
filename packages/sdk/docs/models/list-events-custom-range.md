# ListEventsCustomRange

Filter events by time range

## Example Usage

```typescript
import { ListEventsCustomRange } from "@useautumn/sdk";

let value: ListEventsCustomRange = {};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `start`                                                  | *number*                                                 | :heavy_minus_sign:                                       | Filter events after this timestamp (epoch milliseconds)  |
| `end`                                                    | *number*                                                 | :heavy_minus_sign:                                       | Filter events before this timestamp (epoch milliseconds) |