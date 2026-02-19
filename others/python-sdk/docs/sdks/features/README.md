# Features

## Overview

### Available Operations

* [create](#create) - Creates a new feature.

Use this to programmatically create features for metering usage, managing access, or building credit systems.
* [get](#get) - Retrieves a single feature by its ID.

Use this when you need to fetch the details of a specific feature.
* [list](#list) - Lists all features in the current environment.

Use this to retrieve all features configured for your organization to display in dashboards or for feature management.
* [update](#update) - Updates an existing feature.

Use this to modify feature properties like name, display settings, or to archive a feature.
* [delete](#delete) - Deletes a feature by its ID.

Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.

## create

Creates a new feature.

Use this to programmatically create features for metering usage, managing access, or building credit systems.

### Example Usage

<!-- UsageSnippet language="python" operationID="createFeature" method="post" path="/v1/features.create" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.features.create(name="API Calls", type_="metered", feature_id="api-calls", consumable=True)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                                                                                                                                                                   | Type                                                                                                                                                                                                                                                                                        | Required                                                                                                                                                                                                                                                                                    | Description                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                                                                                                                                                                                                                      | *str*                                                                                                                                                                                                                                                                                       | :heavy_check_mark:                                                                                                                                                                                                                                                                          | The name of the feature.                                                                                                                                                                                                                                                                    |
| `type`                                                                                                                                                                                                                                                                                      | [models.CreateFeatureTypeRequest](../../models/createfeaturetyperequest.md)                                                                                                                                                                                                                 | :heavy_check_mark:                                                                                                                                                                                                                                                                          | The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system. |
| `feature_id`                                                                                                                                                                                                                                                                                | *str*                                                                                                                                                                                                                                                                                       | :heavy_check_mark:                                                                                                                                                                                                                                                                          | The ID of the feature to create.                                                                                                                                                                                                                                                            |
| `consumable`                                                                                                                                                                                                                                                                                | *Optional[bool]*                                                                                                                                                                                                                                                                            | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features.                                                                                  |
| `display`                                                                                                                                                                                                                                                                                   | [Optional[models.CreateFeatureDisplayRequest]](../../models/createfeaturedisplayrequest.md)                                                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Singular and plural display names for the feature in your user interface.                                                                                                                                                                                                                   |
| `credit_schema`                                                                                                                                                                                                                                                                             | List[[models.CreateFeatureCreditSchemaRequest](../../models/createfeaturecreditschemarequest.md)]                                                                                                                                                                                           | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.                                                                                                                                                                                  |
| `event_names`                                                                                                                                                                                                                                                                               | List[*str*]                                                                                                                                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | N/A                                                                                                                                                                                                                                                                                         |
| `retries`                                                                                                                                                                                                                                                                                   | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                                                                                                                                                                            | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Configuration to override the default retry behavior of the client.                                                                                                                                                                                                                         |

### Response

**[models.CreateFeatureResponse](../../models/createfeatureresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Retrieves a single feature by its ID.

Use this when you need to fetch the details of a specific feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="getFeature" method="post" path="/v1/features.get" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.features.get(feature_id="api-calls")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `feature_id`                                                        | *str*                                                               | :heavy_check_mark:                                                  | The ID of the feature.                                              |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.GetFeatureResponse](../../models/getfeatureresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## list

Lists all features in the current environment.

Use this to retrieve all features configured for your organization to display in dashboards or for feature management.

### Example Usage

<!-- UsageSnippet language="python" operationID="listFeatures" method="post" path="/v1/features.list" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.features.list()

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `request`                                                           | [models.ListFeaturesRequest](../../models/listfeaturesrequest.md)   | :heavy_check_mark:                                                  | The request object to use for the request.                          |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.ListFeaturesResponse](../../models/listfeaturesresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing feature.

Use this to modify feature properties like name, display settings, or to archive a feature.

### Example Usage

<!-- UsageSnippet language="python" operationID="updateFeature" method="post" path="/v1/features.update" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.features.update(feature_id="api-calls", name="API Requests", display={
        "singular": "API request",
        "plural": "API requests",
    })

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                                                                                                                                                                                                                   | Type                                                                                                                                                                                                                                                                                        | Required                                                                                                                                                                                                                                                                                    | Description                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature_id`                                                                                                                                                                                                                                                                                | *str*                                                                                                                                                                                                                                                                                       | :heavy_check_mark:                                                                                                                                                                                                                                                                          | The ID of the feature to update.                                                                                                                                                                                                                                                            |
| `name`                                                                                                                                                                                                                                                                                      | *Optional[str]*                                                                                                                                                                                                                                                                             | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | The name of the feature.                                                                                                                                                                                                                                                                    |
| `type`                                                                                                                                                                                                                                                                                      | [Optional[models.UpdateFeatureTypeRequest]](../../models/updatefeaturetyperequest.md)                                                                                                                                                                                                       | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system. |
| `consumable`                                                                                                                                                                                                                                                                                | *Optional[bool]*                                                                                                                                                                                                                                                                            | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features.                                                                                  |
| `display`                                                                                                                                                                                                                                                                                   | [Optional[models.UpdateFeatureDisplayRequest]](../../models/updatefeaturedisplayrequest.md)                                                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Singular and plural display names for the feature in your user interface.                                                                                                                                                                                                                   |
| `credit_schema`                                                                                                                                                                                                                                                                             | List[[models.UpdateFeatureCreditSchemaRequest](../../models/updatefeaturecreditschemarequest.md)]                                                                                                                                                                                           | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.                                                                                                                                                                                  |
| `event_names`                                                                                                                                                                                                                                                                               | List[*str*]                                                                                                                                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | N/A                                                                                                                                                                                                                                                                                         |
| `archived`                                                                                                                                                                                                                                                                                  | *Optional[bool]*                                                                                                                                                                                                                                                                            | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Whether the feature is archived. Archived features are hidden from the dashboard.                                                                                                                                                                                                           |
| `new_feature_id`                                                                                                                                                                                                                                                                            | *Optional[str]*                                                                                                                                                                                                                                                                             | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | The new ID of the feature. Feature ID can only be updated if it's not being used by any customers.                                                                                                                                                                                          |
| `retries`                                                                                                                                                                                                                                                                                   | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                                                                                                                                                                                                            | :heavy_minus_sign:                                                                                                                                                                                                                                                                          | Configuration to override the default retry behavior of the client.                                                                                                                                                                                                                         |

### Response

**[models.UpdateFeatureResponse](../../models/updatefeatureresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes a feature by its ID.

Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.

### Example Usage

<!-- UsageSnippet language="python" operationID="deleteFeature" method="post" path="/v1/features.delete" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.features.delete(feature_id="old-feature")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `feature_id`                                                        | *str*                                                               | :heavy_check_mark:                                                  | The ID of the feature to delete.                                    |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.DeleteFeatureResponse](../../models/deletefeatureresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |