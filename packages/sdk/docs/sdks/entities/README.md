# Entities

## Overview

### Available Operations

* [create](#create) - Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.

Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.

@example
```typescript
// Create a seat entity
const response = await client.entities.create({

  customerId: "cus_123",
  entityId: "seat_42",
  featureId: "seats",
  name: "Seat 42",
});
```

@param name - The name of the entity (optional)
@param featureId - The ID of the feature this entity is associated with
@param customerData - Customer attributes used to resolve the customer when customer_id is not provided. (optional)
@param customerId - The ID of the customer to create the entity for.
@param entityId - The ID of the entity.

@returns The created entity object including its current subscriptions, purchases, and balances.
* [get](#get) - Fetches an entity by its ID.

Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.

@example
```typescript
// Fetch a seat entity
const response = await client.entities.get({ entityId: "seat_42" });
```

@example
```typescript
// Fetch a seat entity for a specific customer
const response = await client.entities.get({ customerId: "cus_123", entityId: "seat_42" });
```

@param customerId - The ID of the customer to create the entity for. (optional)
@param entityId - The ID of the entity.

@returns The entity object including its current subscriptions, purchases, and balances.
* [delete](#delete) - Deletes an entity by entity ID.

Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.

@example
```typescript
// Delete a seat entity
const response = await client.entities.delete({ entityId: "seat_42" });
```

@param customerId - The ID of the customer. (optional)
@param entityId - The ID of the entity.

@returns A success flag indicating the entity was deleted.

## create

Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.

Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.

@example
```typescript
// Create a seat entity
const response = await client.entities.create({

  customerId: "cus_123",
  entityId: "seat_42",
  featureId: "seats",
  name: "Seat 42",
});
```

@param name - The name of the entity (optional)
@param featureId - The ID of the feature this entity is associated with
@param customerData - Customer attributes used to resolve the customer when customer_id is not provided. (optional)
@param customerId - The ID of the customer to create the entity for.
@param entityId - The ID of the entity.

@returns The created entity object including its current subscriptions, purchases, and balances.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="createEntity" method="post" path="/v1/entities.create" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.entities.create({
    name: "Seat 42",
    featureId: "seats",
    customerId: "cus_123",
    entityId: "seat_42",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { entitiesCreate } from "@useautumn/sdk/funcs/entities-create.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await entitiesCreate(autumn, {
    name: "Seat 42",
    featureId: "seats",
    customerId: "cus_123",
    entityId: "seat_42",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("entitiesCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreateEntityParams](../../models/create-entity-params.md)                                                                                                              | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.CreateEntityResponse](../../models/create-entity-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## get

Fetches an entity by its ID.

Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.

@example
```typescript
// Fetch a seat entity
const response = await client.entities.get({ entityId: "seat_42" });
```

@example
```typescript
// Fetch a seat entity for a specific customer
const response = await client.entities.get({ customerId: "cus_123", entityId: "seat_42" });
```

@param customerId - The ID of the customer to create the entity for. (optional)
@param entityId - The ID of the entity.

@returns The entity object including its current subscriptions, purchases, and balances.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getEntity" method="post" path="/v1/entities.get" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.entities.get({
    entityId: "seat_42",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { entitiesGet } from "@useautumn/sdk/funcs/entities-get.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await entitiesGet(autumn, {
    entityId: "seat_42",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("entitiesGet failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.GetEntityParams](../../models/get-entity-params.md)                                                                                                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.GetEntityResponse](../../models/get-entity-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes an entity by entity ID.

Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.

@example
```typescript
// Delete a seat entity
const response = await client.entities.delete({ entityId: "seat_42" });
```

@param customerId - The ID of the customer. (optional)
@param entityId - The ID of the entity.

@returns A success flag indicating the entity was deleted.

### Example Usage

<!-- UsageSnippet language="typescript" operationID="deleteEntity" method="post" path="/v1/entities.delete" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.entities.delete({
    customerId: "cus_123",
    entityId: "seat_42",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { entitiesDelete } from "@useautumn/sdk/funcs/entities-delete.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await entitiesDelete(autumn, {
    customerId: "cus_123",
    entityId: "seat_42",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("entitiesDelete failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.DeleteEntityParams](../../models/delete-entity-params.md)                                                                                                              | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.DeleteEntityResponse](../../models/delete-entity-response.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |