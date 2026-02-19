# Entities

## Overview

### Available Operations

* [create](#create) - Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.

Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.
* [get](#get) - Fetches an entity by its ID.

Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.
* [delete](#delete) - Deletes an entity by entity ID.

Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.

## create

Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.

Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.

### Example Usage

<!-- UsageSnippet language="python" operationID="createEntity" method="post" path="/v1/entities.create" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.entities.create(feature_id="seats", customer_id="cus_123", entity_id="seat_42", name="Seat 42")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `feature_id`                                                        | *str*                                                               | :heavy_check_mark:                                                  | The ID of the feature this entity is associated with                |
| `customer_id`                                                       | *str*                                                               | :heavy_check_mark:                                                  | The ID of the customer to create the entity for.                    |
| `entity_id`                                                         | *str*                                                               | :heavy_check_mark:                                                  | The ID of the entity.                                               |
| `name`                                                              | *OptionalNullable[str]*                                             | :heavy_minus_sign:                                                  | The name of the entity                                              |
| `customer_data`                                                     | [Optional[models.CustomerData]](../../models/customerdata.md)       | :heavy_minus_sign:                                                  | Customer details to set when creating a customer                    |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.CreateEntityResponse](../../models/createentityresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Fetches an entity by its ID.

Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.

### Example Usage

<!-- UsageSnippet language="python" operationID="getEntity" method="post" path="/v1/entities.get" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.entities.get(entity_id="seat_42")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `entity_id`                                                         | *str*                                                               | :heavy_check_mark:                                                  | The ID of the entity.                                               |
| `customer_id`                                                       | *Optional[str]*                                                     | :heavy_minus_sign:                                                  | The ID of the customer to create the entity for.                    |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.GetEntityResponse](../../models/getentityresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes an entity by entity ID.

Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.

### Example Usage

<!-- UsageSnippet language="python" operationID="deleteEntity" method="post" path="/v1/entities.delete" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.entities.delete(entity_id="seat_42", customer_id="cus_123")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `entity_id`                                                         | *str*                                                               | :heavy_check_mark:                                                  | The ID of the entity.                                               |
| `customer_id`                                                       | *Optional[str]*                                                     | :heavy_minus_sign:                                                  | The ID of the customer.                                             |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.DeleteEntityResponse](../../models/deleteentityresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |