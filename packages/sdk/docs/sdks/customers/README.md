# Customers

## Overview

### Available Operations

* [getOrCreate](#getorcreate) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.

@example
```typescript
// Create or fetch a customer by external ID
const response = await client.getOrCreate({


    "id": "cus_123",
    "name": "John Doe",
    "email": "john@example.com"
  });
```

## getOrCreate

Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.

@example
```typescript
// Create or fetch a customer by external ID
const response = await client.getOrCreate({


    "id": "cus_123",
    "name": "John Doe",
    "email": "john@example.com"
  });
```

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getOrCreate" method="post" path="/v1/customers.getOrCreate" -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.customers.getOrCreate({
    customerId: "cus_123",
    name: "John Doe",
    email: "john@example.com",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { AutumnCore } from "@useautumn/sdk/core.js";
import { customersGetOrCreate } from "@useautumn/sdk/funcs/customers-get-or-create.js";

// Use `AutumnCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const autumn = new AutumnCore({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const res = await customersGetOrCreate(autumn, {
    customerId: "cus_123",
    name: "John Doe",
    email: "john@example.com",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("customersGetOrCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.GetOrCreateCustomerParams](../../models/get-or-create-customer-params.md)                                                                                              | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.Customer](../../models/customer.md)\>**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| models.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |