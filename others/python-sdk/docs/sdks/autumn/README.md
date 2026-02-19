# Autumn SDK

## Overview

### Available Operations

* [check](#check) - Checks whether a customer currently has enough balance to use a feature.

Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.
* [track](#track) - Records usage for a customer feature and returns updated balances.

Use this after an action happens to decrement usage, or send a negative value to credit balance back.

## check

Checks whether a customer currently has enough balance to use a feature.

Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.

### Example Usage

<!-- UsageSnippet language="python" operationID="check" method="post" path="/v1/balances.check" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                                    | Type                                                                                                                                                         | Required                                                                                                                                                     | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customer_id`                                                                                                                                                | *str*                                                                                                                                                        | :heavy_check_mark:                                                                                                                                           | The ID of the customer.                                                                                                                                      |
| `feature_id`                                                                                                                                                 | *str*                                                                                                                                                        | :heavy_check_mark:                                                                                                                                           | The ID of the feature.                                                                                                                                       |
| `entity_id`                                                                                                                                                  | *Optional[str]*                                                                                                                                              | :heavy_minus_sign:                                                                                                                                           | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                                                                     |
| `required_balance`                                                                                                                                           | *Optional[float]*                                                                                                                                            | :heavy_minus_sign:                                                                                                                                           | Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1.                                    |
| `properties`                                                                                                                                                 | Dict[str, *Any*]                                                                                                                                             | :heavy_minus_sign:                                                                                                                                           | Additional properties to attach to the usage event if send_event is true.                                                                                    |
| `send_event`                                                                                                                                                 | *Optional[bool]*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                           | If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call. |
| `with_preview`                                                                                                                                               | *Optional[bool]*                                                                                                                                             | :heavy_minus_sign:                                                                                                                                           | If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls.                                          |
| `retries`                                                                                                                                                    | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                                             | :heavy_minus_sign:                                                                                                                                           | Configuration to override the default retry behavior of the client.                                                                                          |

### Response

**[models.CheckResponse](../../models/checkresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## track

Records usage for a customer feature and returns updated balances.

Use this after an action happens to decrement usage, or send a negative value to credit balance back.

### Example Usage

<!-- UsageSnippet language="python" operationID="track" method="post" path="/v1/balances.track" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.track(customer_id="cus_123", feature_id="messages", value=1)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                              | Type                                                                                                                   | Required                                                                                                               | Description                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `customer_id`                                                                                                          | *str*                                                                                                                  | :heavy_check_mark:                                                                                                     | The ID of the customer.                                                                                                |
| `feature_id`                                                                                                           | *Optional[str]*                                                                                                        | :heavy_minus_sign:                                                                                                     | The ID of the feature to track usage for. Required if event_name is not provided.                                      |
| `entity_id`                                                                                                            | *Optional[str]*                                                                                                        | :heavy_minus_sign:                                                                                                     | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                               |
| `event_name`                                                                                                           | *Optional[str]*                                                                                                        | :heavy_minus_sign:                                                                                                     | Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. |
| `value`                                                                                                                | *Optional[float]*                                                                                                      | :heavy_minus_sign:                                                                                                     | The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat).      |
| `properties`                                                                                                           | Dict[str, *Any*]                                                                                                       | :heavy_minus_sign:                                                                                                     | Additional properties to attach to this usage event.                                                                   |
| `retries`                                                                                                              | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                       | :heavy_minus_sign:                                                                                                     | Configuration to override the default retry behavior of the client.                                                    |

### Response

**[models.TrackResponse](../../models/trackresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |