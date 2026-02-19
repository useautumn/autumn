# Plans

## Overview

### Available Operations

* [create](#create) - Create a plan
* [get](#get) - Get a plan
* [list](#list) - List all plans
* [update](#update) - Update a plan
* [delete](#delete) - Delete a plan

## create

Creates a new plan with optional base price and feature configurations.

Use this to programmatically create pricing plans. See [How plans work](/documentation/pricing/plans) for concepts.

### Example Usage

<!-- UsageSnippet language="python" operationID="createPlan" method="post" path="/v1/plans.create" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.plans.create(plan_id="free_plan", name="Free", group="", add_on=False, auto_enable=True, items=[
        {
            "feature_id": "messages",
            "included": 100,
            "reset": {
                "interval": "month",
            },
        },
    ])

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                 | Type                                                                                                                      | Required                                                                                                                  | Description                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `plan_id`                                                                                                                 | *str*                                                                                                                     | :heavy_check_mark:                                                                                                        | The ID of the plan to create.                                                                                             |
| `name`                                                                                                                    | *str*                                                                                                                     | :heavy_check_mark:                                                                                                        | Display name of the plan.                                                                                                 |
| `group`                                                                                                                   | *Optional[str]*                                                                                                           | :heavy_minus_sign:                                                                                                        | Group identifier for organizing related plans. Plans in the same group are mutually exclusive.                            |
| `description`                                                                                                             | *OptionalNullable[str]*                                                                                                   | :heavy_minus_sign:                                                                                                        | Optional description of the plan.                                                                                         |
| `add_on`                                                                                                                  | *Optional[bool]*                                                                                                          | :heavy_minus_sign:                                                                                                        | If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group. |
| `auto_enable`                                                                                                             | *Optional[bool]*                                                                                                          | :heavy_minus_sign:                                                                                                        | If true, plan is automatically attached when a customer is created. Use for free tiers.                                   |
| `price`                                                                                                                   | [Optional[models.CreatePlanPriceRequest]](../../models/createplanpricerequest.md)                                         | :heavy_minus_sign:                                                                                                        | Base recurring price for the plan. Omit for free or usage-only plans.                                                     |
| `items`                                                                                                                   | List[[models.CreatePlanItemRequest](../../models/createplanitemrequest.md)]                                               | :heavy_minus_sign:                                                                                                        | Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.                      |
| `free_trial`                                                                                                              | [Optional[models.CreatePlanFreeTrialRequest]](../../models/createplanfreetrialrequest.md)                                 | :heavy_minus_sign:                                                                                                        | Free trial configuration. Customers can try this plan before being charged.                                               |
| `retries`                                                                                                                 | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                          | :heavy_minus_sign:                                                                                                        | Configuration to override the default retry behavior of the client.                                                       |

### Response

**[models.CreatePlanResponse](../../models/createplanresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Retrieves a single plan by its ID.

Use this to fetch the full configuration of a specific plan, including its features and pricing.

### Example Usage

<!-- UsageSnippet language="python" operationID="getPlan" method="post" path="/v1/plans.get" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.plans.get(plan_id="pro_plan")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `plan_id`                                                           | *str*                                                               | :heavy_check_mark:                                                  | The ID of the plan to retrieve.                                     |
| `version`                                                           | *Optional[float]*                                                   | :heavy_minus_sign:                                                  | The version of the plan to get. Defaults to the latest version.     |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.GetPlanResponse](../../models/getplanresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## list

Lists all plans in the current environment.

Use this to retrieve all plans for displaying pricing pages or managing plan configurations.

### Example Usage

<!-- UsageSnippet language="python" operationID="listPlans" method="post" path="/v1/plans.list" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.plans.list(request={})

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `request`                                                           | [models.ListPlansParams](../../models/listplansparams.md)           | :heavy_check_mark:                                                  | The request object to use for the request.                          |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.ListPlansResponse](../../models/listplansresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing plan. Creates a new version unless `disableVersion` is set.

Use this to modify plan properties, pricing, or feature configurations. See [Adding features to plans](/documentation/pricing/plan-features) for item configuration.

### Example Usage

<!-- UsageSnippet language="python" operationID="updatePlan" method="post" path="/v1/plans.update" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.plans.update(plan_id="pro_plan", group="", name="Pro Plan (Updated)", price={
        "amount": 15,
        "interval": "month",
    }, archived=False)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                            | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `plan_id`                                                                                            | *str*                                                                                                | :heavy_check_mark:                                                                                   | The ID of the plan to update.                                                                        |
| `group`                                                                                              | *Optional[str]*                                                                                      | :heavy_minus_sign:                                                                                   | Group identifier for organizing related plans. Plans in the same group are mutually exclusive.       |
| `name`                                                                                               | *Optional[str]*                                                                                      | :heavy_minus_sign:                                                                                   | Display name of the plan.                                                                            |
| `description`                                                                                        | *Optional[str]*                                                                                      | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `add_on`                                                                                             | *Optional[bool]*                                                                                     | :heavy_minus_sign:                                                                                   | Whether the plan is an add-on.                                                                       |
| `auto_enable`                                                                                        | *Optional[bool]*                                                                                     | :heavy_minus_sign:                                                                                   | Whether the plan is automatically enabled.                                                           |
| `price`                                                                                              | [OptionalNullable[models.UpdatePlanPriceRequest]](../../models/updateplanpricerequest.md)            | :heavy_minus_sign:                                                                                   | The price of the plan. Set to null to remove the base price.                                         |
| `items`                                                                                              | List[[models.UpdatePlanItemRequest](../../models/updateplanitemrequest.md)]                          | :heavy_minus_sign:                                                                                   | Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. |
| `free_trial`                                                                                         | [OptionalNullable[models.UpdatePlanFreeTrialRequest]](../../models/updateplanfreetrialrequest.md)    | :heavy_minus_sign:                                                                                   | The free trial of the plan. Set to null to remove the free trial.                                    |
| `version`                                                                                            | *Optional[float]*                                                                                    | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `archived`                                                                                           | *Optional[bool]*                                                                                     | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `new_plan_id`                                                                                        | *Optional[str]*                                                                                      | :heavy_minus_sign:                                                                                   | The new ID to use for the plan. Can only be updated if the plan has not been used by any customers.  |
| `retries`                                                                                            | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                     | :heavy_minus_sign:                                                                                   | Configuration to override the default retry behavior of the client.                                  |

### Response

**[models.UpdatePlanResponse](../../models/updateplanresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes a plan by its ID.

Use this to permanently remove a plan. Plans with active customers cannot be deleted - archive them instead.

### Example Usage

<!-- UsageSnippet language="python" operationID="deletePlan" method="post" path="/v1/plans.delete" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.plans.delete(plan_id="unused_plan", all_versions=False)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                              | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `plan_id`                                                                              | *str*                                                                                  | :heavy_check_mark:                                                                     | The ID of the plan to delete.                                                          |
| `all_versions`                                                                         | *Optional[bool]*                                                                       | :heavy_minus_sign:                                                                     | If true, deletes all versions of the plan. Otherwise, only deletes the latest version. |
| `retries`                                                                              | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                       | :heavy_minus_sign:                                                                     | Configuration to override the default retry behavior of the client.                    |

### Response

**[models.DeletePlanResponse](../../models/deleteplanresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |