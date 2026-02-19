# Features

## Overview

### Available Operations

* [create](#create) - Creates a new feature.

Use this to programmatically create features for metering usage, managing access, or building credit systems.

@example
```typescript
// Create a metered feature for API calls
const response = await client.features.create({

  featureId: "api-calls",
  name: "API Calls",
  type: "metered",
  consumable: true,
});
```

@example
```typescript
// Create a boolean feature for a premium feature flag
const response = await client.features.create({ featureId: "advanced-analytics", name: "Advanced Analytics", type: "boolean" });
```

@param name - The name of the feature.
@param type - The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
@param consumable - Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features. (optional)
@param display - Singular and plural display names for the feature in your user interface. (optional)
@param creditSchema - A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features. (optional)
@param featureId - The ID of the feature to create.

@returns The created feature object.
* [get](#get) - Retrieves a single feature by its ID.

Use this when you need to fetch the details of a specific feature.

@example
```typescript
// Get a feature by ID
const response = await client.features.get({ featureId: "api-calls" });
```

@param featureId - The ID of the feature.

@returns The feature object with its full configuration.
* [list](#list) - Lists all features in the current environment.

Use this to retrieve all features configured for your organization to display in dashboards or for feature management.

@returns A list of all features with their configuration and metadata.
* [update](#update) - Updates an existing feature.

Use this to modify feature properties like name, display settings, or to archive a feature.

@example
```typescript
// Update a feature's display name
const response = await client.features.update({ featureId: "api-calls", name: "API Requests", display: {"singular":"API request","plural":"API requests"} });
```

@example
```typescript
// Archive a feature
const response = await client.features.update({ featureId: "deprecated-feature", archived: true });
```

@param name - The name of the feature. (optional)
@param type - The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system. (optional)
@param consumable - Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features. (optional)
@param display - Singular and plural display names for the feature in your user interface. (optional)
@param creditSchema - A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features. (optional)
@param archived - Whether the feature is archived. Archived features are hidden from the dashboard. (optional)
@param featureId - The ID of the feature to update.
@param newFeatureId - The new ID of the feature. Feature ID can only be updated if it's not being used by any customers. (optional)

@returns The updated feature object.
* [delete](#delete) - Deletes a feature by its ID.

Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.

@example
```typescript
// Delete an unused feature
const response = await client.features.delete({ featureId: "old-feature" });
```

@param featureId - The ID of the feature to delete.

@returns A success flag indicating the feature was deleted.

## create

Creates a new feature.

Use this to programmatically create features for metering usage, managing access, or building credit systems.

@example
```typescript
// Create a metered feature for API calls
const response = await client.features.create({

  featureId: "api-calls",
  name: "API Calls",
  type: "metered",
  consumable: true,
});
```

@example
```typescript
// Create a boolean feature for a premium feature flag
const response = await client.features.create({ featureId: "advanced-analytics", name: "Advanced Analytics", type: "boolean" });
```

@param name - The name of the feature.
@param type - The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
@param consumable - Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features. (optional)
@param display - Singular and plural display names for the feature in your user interface. (optional)
@param creditSchema - A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features. (optional)
@param featureId - The ID of the feature to create.

@returns The created feature object.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="createFeature" method="post" path="/v1/features.create" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.features.create({
    name: "API Calls",
    type: "metered",
    consumable: true,
    featureId: "api-calls",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { featuresCreate } from "@useautumn/sdk/funcs/features-create.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await featuresCreate(autumn, {
    name: "API Calls",
    type: "metered",
    consumable: true,
    featureId: "api-calls",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("featuresCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreateFeatureParams](../../models/create-feature-params.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.CreateFeatureResponse](../../models/create-feature-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Retrieves a single feature by its ID.

Use this when you need to fetch the details of a specific feature.

@example
```typescript
// Get a feature by ID
const response = await client.features.get({ featureId: "api-calls" });
```

@param featureId - The ID of the feature.

@returns The feature object with its full configuration.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getFeature" method="post" path="/v1/features.get" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.features.get({
    featureId: "api-calls",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { featuresGet } from "@useautumn/sdk/funcs/features-get.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await featuresGet(autumn, {
    featureId: "api-calls",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("featuresGet failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.GetFeatureParams](../../models/get-feature-params.md)                                                                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.GetFeatureResponse](../../models/get-feature-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## list

Lists all features in the current environment.

Use this to retrieve all features configured for your organization to display in dashboards or for feature management.

@returns A list of all features with their configuration and metadata.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="listFeatures" method="post" path="/v1/features.list" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.features.list();

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { featuresList } from "@useautumn/sdk/funcs/features-list.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await featuresList(autumn);
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("featuresList failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.ListFeaturesRequest](../../models/list-features-request.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.ListFeaturesResponse](../../models/list-features-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing feature.

Use this to modify feature properties like name, display settings, or to archive a feature.

@example
```typescript
// Update a feature's display name
const response = await client.features.update({ featureId: "api-calls", name: "API Requests", display: {"singular":"API request","plural":"API requests"} });
```

@example
```typescript
// Archive a feature
const response = await client.features.update({ featureId: "deprecated-feature", archived: true });
```

@param name - The name of the feature. (optional)
@param type - The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system. (optional)
@param consumable - Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features. (optional)
@param display - Singular and plural display names for the feature in your user interface. (optional)
@param creditSchema - A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features. (optional)
@param archived - Whether the feature is archived. Archived features are hidden from the dashboard. (optional)
@param featureId - The ID of the feature to update.
@param newFeatureId - The new ID of the feature. Feature ID can only be updated if it's not being used by any customers. (optional)

@returns The updated feature object.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="updateFeature" method="post" path="/v1/features.update" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.features.update({
    name: "API Requests",
    display: {
      singular: "API request",
      plural: "API requests",
    },
    featureId: "api-calls",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { featuresUpdate } from "@useautumn/sdk/funcs/features-update.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await featuresUpdate(autumn, {
    name: "API Requests",
    display: {
      singular: "API request",
      plural: "API requests",
    },
    featureId: "api-calls",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("featuresUpdate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.UpdateFeatureParams](../../models/update-feature-params.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.UpdateFeatureResponse](../../models/update-feature-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes a feature by its ID.

Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.

@example
```typescript
// Delete an unused feature
const response = await client.features.delete({ featureId: "old-feature" });
```

@param featureId - The ID of the feature to delete.

@returns A success flag indicating the feature was deleted.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="deleteFeature" method="post" path="/v1/features.delete" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.features.delete({
    featureId: "old-feature",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { featuresDelete } from "@useautumn/sdk/funcs/features-delete.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await featuresDelete(autumn, {
    featureId: "old-feature",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("featuresDelete failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.DeleteFeatureParams](../../models/delete-feature-params.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.DeleteFeatureResponse](../../models/delete-feature-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |