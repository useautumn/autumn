# ListEventsResponse

OK

## Example Usage

```typescript
import { ListEventsResponse } from "@useautumn/sdk";

let value: ListEventsResponse = {
  list: [
    {
      id: "evt_36xpk2TmuQX5zVPPQ8tCtnR5Weg",
      timestamp: 1765958215459,
      featureId: "credits",
      customerId: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
      value: 30,
      properties: {},
    },
    {
      id: "evt_36xmHxxjAkqxufDf9yHAPNfRrLM",
      timestamp: 1765956512057,
      featureId: "credits",
      customerId: "0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx",
      value: 49,
      properties: {},
    },
  ],
  hasMore: false,
  offset: 0,
  limit: 100,
  total: 2,
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `list`                                                   | [models.ListEventsList](../models/list-events-list.md)[] | :heavy_check_mark:                                       | Array of items for current page                          |
| `hasMore`                                                | *boolean*                                                | :heavy_check_mark:                                       | Whether more results exist after this page               |
| `offset`                                                 | *number*                                                 | :heavy_check_mark:                                       | Current offset position                                  |
| `limit`                                                  | *number*                                                 | :heavy_check_mark:                                       | Limit passed in the request                              |
| `total`                                                  | *number*                                                 | :heavy_check_mark:                                       | Total number of items returned in the current page       |