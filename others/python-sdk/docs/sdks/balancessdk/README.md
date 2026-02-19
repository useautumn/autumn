# Balances

## Overview

### Available Operations

* [create](#create) - Create a balance for a customer feature.
* [update](#update) - Update a customer balance.

## create

Create a balance for a customer feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="createBalance" method="post" path="/v1/balances.create" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.create(customer_id="cus_123", feature_id="api_calls", included=1000, reset={
        "interval": "month",
    })

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                    | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `customer_id`                                                                                                | *str*                                                                                                        | :heavy_check_mark:                                                                                           | The ID of the customer.                                                                                      |
| `feature_id`                                                                                                 | *str*                                                                                                        | :heavy_check_mark:                                                                                           | The ID of the feature.                                                                                       |
| `entity_id`                                                                                                  | *Optional[str]*                                                                                              | :heavy_minus_sign:                                                                                           | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                     |
| `included`                                                                                                   | *Optional[float]*                                                                                            | :heavy_minus_sign:                                                                                           | The initial balance amount to grant. For metered features, this is the number of units the customer can use. |
| `unlimited`                                                                                                  | *Optional[bool]*                                                                                             | :heavy_minus_sign:                                                                                           | If true, the balance has unlimited usage. Cannot be combined with 'included'.                                |
| `reset`                                                                                                      | [Optional[models.CreateBalanceReset]](../../models/createbalancereset.md)                                    | :heavy_minus_sign:                                                                                           | Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.     |
| `expires_at`                                                                                                 | *Optional[float]*                                                                                            | :heavy_minus_sign:                                                                                           | Unix timestamp (milliseconds) when the balance expires. Mutually exclusive with reset.                       |
| `granted_balance`                                                                                            | *Optional[float]*                                                                                            | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `retries`                                                                                                    | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                             | :heavy_minus_sign:                                                                                           | Configuration to override the default retry behavior of the client.                                          |

### Response

**[models.CreateBalanceResponse](../../models/createbalanceresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Update a customer balance.

### Example Usage

<!-- UsageSnippet language="python" operationID="updateBalance" method="post" path="/v1/balances.update" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.balances.update(customer_id="cus_123", feature_id="api_calls", remaining=5)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                         | Type                                                                                                                                              | Required                                                                                                                                          | Description                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer_id`                                                                                                                                     | *str*                                                                                                                                             | :heavy_check_mark:                                                                                                                                | The ID of the customer.                                                                                                                           |
| `feature_id`                                                                                                                                      | *str*                                                                                                                                             | :heavy_check_mark:                                                                                                                                | The ID of the feature.                                                                                                                            |
| `entity_id`                                                                                                                                       | *Optional[str]*                                                                                                                                   | :heavy_minus_sign:                                                                                                                                | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                                                          |
| `remaining`                                                                                                                                       | *Optional[float]*                                                                                                                                 | :heavy_minus_sign:                                                                                                                                | Set the remaining balance to this exact value. Cannot be combined with add_to_balance.                                                            |
| `add_to_balance`                                                                                                                                  | *Optional[float]*                                                                                                                                 | :heavy_minus_sign:                                                                                                                                | Add this amount to the current balance. Use negative values to subtract. Cannot be combined with current_balance.                                 |
| `interval`                                                                                                                                        | [Optional[models.UpdateBalanceInterval]](../../models/updatebalanceinterval.md)                                                                   | :heavy_minus_sign:                                                                                                                                | Target a specific balance by its reset interval. Use when the customer has multiple balances for the same feature with different reset intervals. |
| `retries`                                                                                                                                         | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                                  | :heavy_minus_sign:                                                                                                                                | Configuration to override the default retry behavior of the client.                                                                               |

### Response

**[models.UpdateBalanceResponse](../../models/updatebalanceresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |