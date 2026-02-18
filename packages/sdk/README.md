# @useautumn/sdk

Developer-friendly & type-safe Typescript SDK specifically catered to leverage *@useautumn/sdk* API.

[![Built by Speakeasy](https://img.shields.io/badge/Built_by-SPEAKEASY-374151?style=for-the-badge&labelColor=f3f4f6)](https://www.speakeasy.com/?utm_source=@useautumn/sdk&utm_campaign=typescript)
[![License: MIT](https://img.shields.io/badge/LICENSE_//_MIT-3b5bdb?style=for-the-badge&labelColor=eff6ff)](https://opensource.org/licenses/MIT)


<br /><br />
> [!IMPORTANT]
> This SDK is not yet ready for production use. To complete setup please follow the steps outlined in your [workspace](https://app.speakeasy.com/org/autumn-gne/autumn). Delete this section before > publishing to a package manager.

<!-- Start Summary [summary] -->
## Summary


<!-- End Summary [summary] -->

<!-- Start Table of Contents [toc] -->
## Table of Contents
<!-- $toc-max-depth=2 -->
* [@useautumn/sdk](#useautumnsdk)
  * [SDK Installation](#sdk-installation)
  * [Requirements](#requirements)
  * [SDK Example Usage](#sdk-example-usage)
  * [Authentication](#authentication)
  * [Available Resources and Operations](#available-resources-and-operations)
  * [Standalone functions](#standalone-functions)
  * [Retries](#retries)
  * [Error Handling](#error-handling)
  * [Server Selection](#server-selection)
  * [Custom HTTP Client](#custom-http-client)
  * [Debugging](#debugging)
* [Development](#development)
  * [Maturity](#maturity)
  * [Contributions](#contributions)

<!-- End Table of Contents [toc] -->

<!-- Start SDK Installation [installation] -->
## SDK Installation

> [!TIP]
> To finish publishing your SDK to npm and others you must [run your first generation action](https://www.speakeasy.com/docs/github-setup#step-by-step-guide).


The SDK can be installed with either [npm](https://www.npmjs.com/), [pnpm](https://pnpm.io/), [bun](https://bun.sh/) or [yarn](https://classic.yarnpkg.com/en/) package managers.

### NPM

```bash
npm add <UNSET>
```

### PNPM

```bash
pnpm add <UNSET>
```

### Bun

```bash
bun add <UNSET>
```

### Yarn

```bash
yarn add <UNSET>
```

> [!NOTE]
> This package is published with CommonJS and ES Modules (ESM) support.
<!-- End SDK Installation [installation] -->

<!-- Start Requirements [requirements] -->
## Requirements

For supported JavaScript runtimes, please consult [RUNTIMES.md](RUNTIMES.md).
<!-- End Requirements [requirements] -->

<!-- Start SDK Example Usage [usage] -->
## SDK Example Usage

### Example

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
<!-- End SDK Example Usage [usage] -->

<!-- Start Authentication [security] -->
## Authentication

### Per-Client Security Schemes

This SDK supports the following security scheme globally:

| Name        | Type | Scheme      | Environment Variable |
| ----------- | ---- | ----------- | -------------------- |
| `secretKey` | http | HTTP Bearer | `AUTUMN_SECRET_KEY`  |

To authenticate with the API the `secretKey` parameter must be set when initializing the SDK client instance. For example:
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
  xApiVersion: "2.1",
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
<!-- End Authentication [security] -->

<!-- Start Available Resources and Operations [operations] -->
## Available Resources and Operations

<details open>
<summary>Available methods</summary>

### [Balances](docs/sdks/balances/README.md)

* [create](docs/sdks/balances/README.md#create) - Create a balance for a customer feature.
* [update](docs/sdks/balances/README.md#update) - Update a customer balance.
* [check](docs/sdks/balances/README.md#check) - Check whether usage is allowed for a customer feature.
* [track](docs/sdks/balances/README.md#track) - Track usage for a customer feature.

### [Billing](docs/sdks/billing/README.md)

* [attach](docs/sdks/billing/README.md#attach) - Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

@example
```typescript
// Attach a plan to a customer
const response = await client.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
* [previewAttach](docs/sdks/billing/README.md#previewattach) - Preview billing changes before attaching a plan.
* [update](docs/sdks/billing/README.md#update) - Update an existing subscription.
* [previewUpdate](docs/sdks/billing/README.md#previewupdate) - Preview billing changes before updating a subscription.
* [setupPayment](docs/sdks/billing/README.md#setuppayment) - Create a setup payment session for a customer.

### [Customers](docs/sdks/customers/README.md)

* [getOrCreate](docs/sdks/customers/README.md#getorcreate) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.

@example
```typescript
// Create or fetch a customer by external ID
const response = await client.getOrCreate({ customerId: "cus_123", name: "John Doe", email: "john@example.com" });
```

@param name - Customer's name (optional)
@param email - Customer's email address (optional)
@param fingerprint - Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse (optional)
@param metadata - Additional metadata for the customer (optional)
@param stripeId - Stripe customer ID if you already have one (optional)
@param createInStripe - Whether to create the customer in Stripe (optional)
@param autoEnablePlanId - The ID of the free plan to auto-enable for the customer (optional)
@param sendEmailReceipts - Whether to send email receipts to this customer (optional)
@param expand - Customer expand options (optional)
* [list](docs/sdks/customers/README.md#list) - Lists customers with pagination and optional filters.
* [update](docs/sdks/customers/README.md#update) - Updates an existing customer by ID.
* [delete](docs/sdks/customers/README.md#delete) - Deletes a customer by ID.

### [Plans](docs/sdks/plans/README.md)

* [list](docs/sdks/plans/README.md#list) - List all plans

</details>
<!-- End Available Resources and Operations [operations] -->

<!-- Start Standalone functions [standalone-funcs] -->
## Standalone functions

All the methods listed above are available as standalone functions. These
functions are ideal for use in applications running in the browser, serverless
runtimes or other environments where application bundle size is a primary
concern. When using a bundler to build your application, all unused
functionality will be either excluded from the final bundle or tree-shaken away.

To read more about standalone functions, check [FUNCTIONS.md](./FUNCTIONS.md).

<details>

<summary>Available standalone functions</summary>

- [`balancesCheck`](docs/sdks/balances/README.md#check) - Check whether usage is allowed for a customer feature.
- [`balancesCreate`](docs/sdks/balances/README.md#create) - Create a balance for a customer feature.
- [`balancesTrack`](docs/sdks/balances/README.md#track) - Track usage for a customer feature.
- [`balancesUpdate`](docs/sdks/balances/README.md#update) - Update a customer balance.
- [`billingAttach`](docs/sdks/billing/README.md#attach) - Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

@example
```typescript
// Attach a plan to a customer
const response = await client.attach({ customerId: "cus_123", planId: "pro_plan" });
```

@param customerId - The ID of the customer to attach the plan to.
@param entityId - The ID of the entity to attach the plan to. (optional)
@param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
@param version - The version of the plan to attach. (optional)
@param customize - Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both. (optional)
- [`billingPreviewAttach`](docs/sdks/billing/README.md#previewattach) - Preview billing changes before attaching a plan.
- [`billingPreviewUpdate`](docs/sdks/billing/README.md#previewupdate) - Preview billing changes before updating a subscription.
- [`billingSetupPayment`](docs/sdks/billing/README.md#setuppayment) - Create a setup payment session for a customer.
- [`billingUpdate`](docs/sdks/billing/README.md#update) - Update an existing subscription.
- [`customersDelete`](docs/sdks/customers/README.md#delete) - Deletes a customer by ID.
- [`customersGetOrCreate`](docs/sdks/customers/README.md#getorcreate) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.

@example
```typescript
// Create or fetch a customer by external ID
const response = await client.getOrCreate({ customerId: "cus_123", name: "John Doe", email: "john@example.com" });
```

@param name - Customer's name (optional)
@param email - Customer's email address (optional)
@param fingerprint - Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse (optional)
@param metadata - Additional metadata for the customer (optional)
@param stripeId - Stripe customer ID if you already have one (optional)
@param createInStripe - Whether to create the customer in Stripe (optional)
@param autoEnablePlanId - The ID of the free plan to auto-enable for the customer (optional)
@param sendEmailReceipts - Whether to send email receipts to this customer (optional)
@param expand - Customer expand options (optional)
- [`customersList`](docs/sdks/customers/README.md#list) - Lists customers with pagination and optional filters.
- [`customersUpdate`](docs/sdks/customers/README.md#update) - Updates an existing customer by ID.
- [`plansList`](docs/sdks/plans/README.md#list) - List all plans

</details>
<!-- End Standalone functions [standalone-funcs] -->

<!-- Start Retries [retries] -->
## Retries

Some of the endpoints in this SDK support retries.  If you use the SDK without any configuration, it will fall back to the default retry strategy provided by the API.  However, the default retry strategy can be overridden on a per-operation basis, or across the entire SDK.

To change the default retry strategy for a single API call, simply provide a retryConfig object to the call:
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
  }, {
    retries: {
      strategy: "backoff",
      backoff: {
        initialInterval: 1,
        maxInterval: 50,
        exponent: 1.1,
        maxElapsedTime: 100,
      },
      retryConnectionErrors: false,
    },
  });

  console.log(result);
}

run();

```

If you'd like to override the default retry strategy for all operations that support retries, you can provide a retryConfig at SDK initialization:
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  retryConfig: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1,
      maxInterval: 50,
      exponent: 1.1,
      maxElapsedTime: 100,
    },
    retryConnectionErrors: false,
  },
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
<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->
## Error Handling

[`AutumnError`](./src/models/autumn-error.ts) is the base class for all HTTP error responses. It has the following properties:

| Property            | Type       | Description                                            |
| ------------------- | ---------- | ------------------------------------------------------ |
| `error.message`     | `string`   | Error message                                          |
| `error.statusCode`  | `number`   | HTTP response status code eg `404`                     |
| `error.headers`     | `Headers`  | HTTP response headers                                  |
| `error.body`        | `string`   | HTTP body. Can be empty string if no body is returned. |
| `error.rawResponse` | `Response` | Raw HTTP response                                      |

### Example
```typescript
import * as models from "@useautumn/sdk";
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  try {
    const result = await autumn.customers.getOrCreate({
      customerId: "cus_123",
      name: "John Doe",
      email: "john@example.com",
    });

    console.log(result);
  } catch (error) {
    if (error instanceof models.AutumnError) {
      console.log(error.message);
      console.log(error.statusCode);
      console.log(error.body);
      console.log(error.headers);
    }
  }
}

run();

```

### Error Classes
**Primary error:**
* [`AutumnError`](./src/models/autumn-error.ts): The base class for HTTP error responses.

<details><summary>Less common errors (6)</summary>

<br />

**Network errors:**
* [`ConnectionError`](./src/models/http-client-errors.ts): HTTP client was unable to make a request to a server.
* [`RequestTimeoutError`](./src/models/http-client-errors.ts): HTTP request timed out due to an AbortSignal signal.
* [`RequestAbortedError`](./src/models/http-client-errors.ts): HTTP request was aborted by the client.
* [`InvalidRequestError`](./src/models/http-client-errors.ts): Any input used to create a request is invalid.
* [`UnexpectedClientError`](./src/models/http-client-errors.ts): Unrecognised or unexpected error.


**Inherit from [`AutumnError`](./src/models/autumn-error.ts)**:
* [`ResponseValidationError`](./src/models/response-validation-error.ts): Type mismatch between the data returned from the server and the structure expected by the SDK. See `error.rawValue` for the raw value and `error.pretty()` for a nicely formatted multi-line string.

</details>
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Override Server URL Per-Client

The default server can be overridden globally by passing a URL to the `serverURL: string` optional parameter when initializing the SDK client instance. For example:
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  serverURL: "http://localhost:8080",
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
<!-- End Server Selection [server] -->

<!-- Start Custom HTTP Client [http-client] -->
## Custom HTTP Client

The TypeScript SDK makes API calls using an `HTTPClient` that wraps the native
[Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API). This
client is a thin wrapper around `fetch` and provides the ability to attach hooks
around the request lifecycle that can be used to modify the request or handle
errors and response.

The `HTTPClient` constructor takes an optional `fetcher` argument that can be
used to integrate a third-party HTTP client or when writing tests to mock out
the HTTP client and feed in fixtures.

The following example shows how to:
- route requests through a proxy server using [undici](https://www.npmjs.com/package/undici)'s ProxyAgent
- use the `"beforeRequest"` hook to add a custom header and a timeout to requests
- use the `"requestError"` hook to log errors

```typescript
import { Autumn } from "@useautumn/sdk";
import { ProxyAgent } from "undici";
import { HTTPClient } from "@useautumn/sdk/lib/http";

const dispatcher = new ProxyAgent("http://proxy.example.com:8080");

const httpClient = new HTTPClient({
  // 'fetcher' takes a function that has the same signature as native 'fetch'.
  fetcher: (input, init) =>
    // 'dispatcher' is specific to undici and not part of the standard Fetch API.
    fetch(input, { ...init, dispatcher } as RequestInit),
});

httpClient.addHook("beforeRequest", (request) => {
  const nextRequest = new Request(request, {
    signal: request.signal || AbortSignal.timeout(5000)
  });

  nextRequest.headers.set("x-custom-header", "custom value");

  return nextRequest;
});

httpClient.addHook("requestError", (error, request) => {
  console.group("Request Error");
  console.log("Reason:", `${error}`);
  console.log("Endpoint:", `${request.method} ${request.url}`);
  console.groupEnd();
});

const sdk = new Autumn({ httpClient: httpClient });
```
<!-- End Custom HTTP Client [http-client] -->

<!-- Start Debugging [debug] -->
## Debugging

You can setup your SDK to emit debug logs for SDK requests and responses.

You can pass a logger that matches `console`'s interface as an SDK option.

> [!WARNING]
> Beware that debug logging will reveal secrets, like API tokens in headers, in log messages printed to a console or files. It's recommended to use this feature only during local development and not in production.

```typescript
import { Autumn } from "@useautumn/sdk";

const sdk = new Autumn({ debugLogger: console });
```

You can also enable a default debug logger by setting an environment variable `AUTUMN_DEBUG` to true.
<!-- End Debugging [debug] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->

# Development

## Maturity

This SDK is in beta, and there may be breaking changes between versions without a major version update. Therefore, we recommend pinning usage
to a specific package version. This way, you can install the same version each time without breaking changes unless you are intentionally
looking for the latest version.

## Contributions

While we value open-source contributions to this SDK, this library is generated programmatically. Any manual changes added to internal files will be overwritten on the next generation. 
We look forward to hearing your feedback. Feel free to open a PR or an issue with a proof of concept and we'll do our best to include it in a future release. 

### SDK Created by [Speakeasy](https://www.speakeasy.com/?utm_source=@useautumn/sdk&utm_campaign=typescript)
