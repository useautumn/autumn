# Balances

## Overview

### Available Operations

* [create](#create) - Create a balance for a customer feature.
* [update](#update) - Update a customer balance.
* [check](#check) - Check whether usage is allowed for a customer feature.
* [track](#track) - Track usage for a customer feature.

## create

Create a balance for a customer feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="balancesCreate" method="post" path="/v1/balances.create" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.create(feature_id="<id>", customer_id="<id>")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                   | Type                                                                        | Required                                                                    | Description                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `feature_id`                                                                | *str*                                                                       | :heavy_check_mark:                                                          | The feature ID to create the balance for                                    |
| `customer_id`                                                               | *str*                                                                       | :heavy_check_mark:                                                          | The customer ID to assign the balance to                                    |
| `entity_id`                                                                 | *Optional[str]*                                                             | :heavy_minus_sign:                                                          | Entity ID for entity-scoped balances                                        |
| `included`                                                                  | *Optional[float]*                                                           | :heavy_minus_sign:                                                          | The initial balance amount to grant                                         |
| `unlimited`                                                                 | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | Whether the balance is unlimited                                            |
| `reset`                                                                     | [Optional[models.BalancesCreateReset]](../../models/balancescreatereset.md) | :heavy_minus_sign:                                                          | Reset configuration for the balance                                         |
| `expires_at`                                                                | *Optional[float]*                                                           | :heavy_minus_sign:                                                          | Unix timestamp (milliseconds) when the balance expires                      |
| `granted_balance`                                                           | *Optional[float]*                                                           | :heavy_minus_sign:                                                          | N/A                                                                         |
| `retries`                                                                   | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)            | :heavy_minus_sign:                                                          | Configuration to override the default retry behavior of the client.         |

### Response

**[models.BalancesCreateResponse](../../models/balancescreateresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Update a customer balance.

### Example Usage

<!-- UsageSnippet language="python" operationID="balancesUpdate" method="post" path="/v1/balances.update" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.update(customer_id="<id>", feature_id="<id>")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                         | Type                                                                              | Required                                                                          | Description                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `customer_id`                                                                     | *str*                                                                             | :heavy_check_mark:                                                                | The ID of the customer.                                                           |
| `feature_id`                                                                      | *str*                                                                             | :heavy_check_mark:                                                                | The ID of the feature to update balance for.                                      |
| `entity_id`                                                                       | *Optional[str]*                                                                   | :heavy_minus_sign:                                                                | The ID of the entity to update balance for (if using entity balances).            |
| `current_balance`                                                                 | *Optional[float]*                                                                 | :heavy_minus_sign:                                                                | The new balance value to set.                                                     |
| `interval`                                                                        | [Optional[models.BalancesUpdateInterval]](../../models/balancesupdateinterval.md) | :heavy_minus_sign:                                                                | The interval to update balance for.                                               |
| `granted_balance`                                                                 | *Optional[float]*                                                                 | :heavy_minus_sign:                                                                | N/A                                                                               |
| `usage`                                                                           | *Optional[float]*                                                                 | :heavy_minus_sign:                                                                | N/A                                                                               |
| `customer_entitlement_id`                                                         | *Optional[str]*                                                                   | :heavy_minus_sign:                                                                | N/A                                                                               |
| `next_reset_at`                                                                   | *Optional[float]*                                                                 | :heavy_minus_sign:                                                                | N/A                                                                               |
| `add_to_balance`                                                                  | *Optional[float]*                                                                 | :heavy_minus_sign:                                                                | N/A                                                                               |
| `retries`                                                                         | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                  | :heavy_minus_sign:                                                                | Configuration to override the default retry behavior of the client.               |

### Response

**[models.BalancesUpdateResponse](../../models/balancesupdateresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## check

Check whether usage is allowed for a customer feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="balancesCheck" method="post" path="/v1/balances.check" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.check(customer_id="<id>", feature_id="<id>")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                   | Type                                                                                                                                        | Required                                                                                                                                    | Description                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer_id`                                                                                                                               | *str*                                                                                                                                       | :heavy_check_mark:                                                                                                                          | ID which you provided when creating the customer                                                                                            |
| `feature_id`                                                                                                                                | *str*                                                                                                                                       | :heavy_check_mark:                                                                                                                          | ID of the feature to check access to.                                                                                                       |
| `entity_id`                                                                                                                                 | *Optional[str]*                                                                                                                             | :heavy_minus_sign:                                                                                                                          | If using entity balances (eg, seats), the entity ID to check access for.                                                                    |
| `required_balance`                                                                                                                          | *Optional[float]*                                                                                                                           | :heavy_minus_sign:                                                                                                                          | If you know the amount of the feature the end user is consuming in advance. If their balance is below this quantity, allowed will be false. |
| `properties`                                                                                                                                | Dict[str, *Any*]                                                                                                                            | :heavy_minus_sign:                                                                                                                          | N/A                                                                                                                                         |
| `send_event`                                                                                                                                | *Optional[bool]*                                                                                                                            | :heavy_minus_sign:                                                                                                                          | If true, a usage event will be recorded together with checking access. The required_balance field will be used as the usage value.          |
| `with_preview`                                                                                                                              | *Optional[bool]*                                                                                                                            | :heavy_minus_sign:                                                                                                                          | If true, the response will include a preview object, which can be used to display information such as a paywall or upgrade confirmation.    |
| `retries`                                                                                                                                   | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                            | :heavy_minus_sign:                                                                                                                          | Configuration to override the default retry behavior of the client.                                                                         |

### Response

**[models.BalancesCheckResponse](../../models/balancescheckresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## track

Track usage for a customer feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="balancesTrack" method="post" path="/v1/balances.track" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.track(customer_id="<id>")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                                            | Type                                                                                                                                                                 | Required                                                                                                                                                             | Description                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer_id`                                                                                                                                                        | *str*                                                                                                                                                                | :heavy_check_mark:                                                                                                                                                   | ID which you provided when creating the customer                                                                                                                     |
| `feature_id`                                                                                                                                                         | *Optional[str]*                                                                                                                                                      | :heavy_minus_sign:                                                                                                                                                   | ID of the feature to track usage for. Required if event_name is not provided. Use this for direct feature tracking.                                                  |
| `event_name`                                                                                                                                                         | *Optional[str]*                                                                                                                                                      | :heavy_minus_sign:                                                                                                                                                   | An [event name](/features/tracking-usage#using-event-names) can be used in place of feature_id. This can be used if multiple features are tracked in the same event. |
| `value`                                                                                                                                                              | *Optional[float]*                                                                                                                                                    | :heavy_minus_sign:                                                                                                                                                   | The amount of usage to record. Defaults to 1. Can be negative to increase the balance (e.g., when removing a seat).                                                  |
| `properties`                                                                                                                                                         | Dict[str, *Any*]                                                                                                                                                     | :heavy_minus_sign:                                                                                                                                                   | Additional properties to attach to this usage event.                                                                                                                 |
| `idempotency_key`                                                                                                                                                    | *Optional[str]*                                                                                                                                                      | :heavy_minus_sign:                                                                                                                                                   | Unique key to prevent duplicate event recording. Use this to safely retry requests without creating duplicate usage records.                                         |
| `entity_id`                                                                                                                                                          | *Optional[str]*                                                                                                                                                      | :heavy_minus_sign:                                                                                                                                                   | If using [entity balances](/features/feature-entities) (eg, seats), the entity ID to track usage for.                                                                |
| `retries`                                                                                                                                                            | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                                                     | :heavy_minus_sign:                                                                                                                                                   | Configuration to override the default retry behavior of the client.                                                                                                  |

### Response

**[models.BalancesTrackResponse](../../models/balancestrackresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |