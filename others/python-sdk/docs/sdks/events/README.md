# Events

## Overview

### Available Operations

* [list](#list) - List usage events for your organization. Filter by customer, feature, or time range.
* [aggregate](#aggregate) - Aggregate usage events by time period. Returns usage totals grouped by feature and optionally by a custom property.

## list

List usage events for your organization. Filter by customer, feature, or time range.

### Example Usage

<!-- UsageSnippet language="python" operationID="listEvents" method="post" path="/v1/events.list" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.events.list(offset=0, limit=50, customer_id="cus_123")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                       | Type                                                                            | Required                                                                        | Description                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `offset`                                                                        | *Optional[int]*                                                                 | :heavy_minus_sign:                                                              | Number of items to skip                                                         |
| `limit`                                                                         | *Optional[int]*                                                                 | :heavy_minus_sign:                                                              | Number of items to return. Default 100, max 1000.                               |
| `customer_id`                                                                   | *Optional[str]*                                                                 | :heavy_minus_sign:                                                              | Filter events by customer ID                                                    |
| `feature_id`                                                                    | [Optional[models.ListEventsFeatureID]](../../models/listeventsfeatureid.md)     | :heavy_minus_sign:                                                              | Filter by specific feature ID(s)                                                |
| `custom_range`                                                                  | [Optional[models.ListEventsCustomRange]](../../models/listeventscustomrange.md) | :heavy_minus_sign:                                                              | Filter events by time range                                                     |
| `retries`                                                                       | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                | :heavy_minus_sign:                                                              | Configuration to override the default retry behavior of the client.             |

### Response

**[models.ListEventsResponse](../../models/listeventsresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## aggregate

Aggregate usage events by time period. Returns usage totals grouped by feature and optionally by a custom property.

### Example Usage

<!-- UsageSnippet language="python" operationID="aggregateEvents" method="post" path="/v1/events.aggregate" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.events.aggregate(customer_id="cus_123", feature_id="api_calls", range="30d", bin_size="day")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                             | Type                                                                                                                  | Required                                                                                                              | Description                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `customer_id`                                                                                                         | *str*                                                                                                                 | :heavy_check_mark:                                                                                                    | Customer ID to aggregate events for                                                                                   |
| `feature_id`                                                                                                          | [models.AggregateEventsFeatureID](../../models/aggregateeventsfeatureid.md)                                           | :heavy_check_mark:                                                                                                    | Feature ID(s) to aggregate events for                                                                                 |
| `group_by`                                                                                                            | *Optional[str]*                                                                                                       | :heavy_minus_sign:                                                                                                    | Property to group events by. If provided, each key in the response will be an object with distinct groups as the keys |
| `range`                                                                                                               | [Optional[models.Range]](../../models/range.md)                                                                       | :heavy_minus_sign:                                                                                                    | Time range to aggregate events for. Either range or custom_range must be provided                                     |
| `bin_size`                                                                                                            | [Optional[models.BinSize]](../../models/binsize.md)                                                                   | :heavy_minus_sign:                                                                                                    | Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day                        |
| `custom_range`                                                                                                        | [Optional[models.AggregateEventsCustomRange]](../../models/aggregateeventscustomrange.md)                             | :heavy_minus_sign:                                                                                                    | Custom time range to aggregate events for. If provided, range must not be provided                                    |
| `retries`                                                                                                             | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                      | :heavy_minus_sign:                                                                                                    | Configuration to override the default retry behavior of the client.                                                   |

### Response

**[models.AggregateEventsResponse](../../models/aggregateeventsresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |