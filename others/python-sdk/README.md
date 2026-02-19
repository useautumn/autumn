# autumn-sdk

Developer-friendly & type-safe Python SDK specifically catered to leverage *autumn-sdk* API.

[![Built by Speakeasy](https://img.shields.io/badge/Built_by-SPEAKEASY-374151?style=for-the-badge&labelColor=f3f4f6)](https://www.speakeasy.com/?utm_source=autumn-sdk&utm_campaign=python)
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
* [autumn-sdk](#autumn-sdk)
  * [SDK Installation](#sdk-installation)
  * [IDE Support](#ide-support)
  * [SDK Example Usage](#sdk-example-usage)
  * [Authentication](#authentication)
  * [Available Resources and Operations](#available-resources-and-operations)
  * [Retries](#retries)
  * [Error Handling](#error-handling)
  * [Server Selection](#server-selection)
  * [Custom HTTP Client](#custom-http-client)
  * [Resource Management](#resource-management)
  * [Debugging](#debugging)
* [Development](#development)
  * [Maturity](#maturity)
  * [Contributions](#contributions)

<!-- End Table of Contents [toc] -->

<!-- Start SDK Installation [installation] -->
## SDK Installation

> [!TIP]
> To finish publishing your SDK to PyPI you must [run your first generation action](https://www.speakeasy.com/docs/github-setup#step-by-step-guide).


> [!NOTE]
> **Python version upgrade policy**
>
> Once a Python version reaches its [official end of life date](https://devguide.python.org/versions/), a 3-month grace period is provided for users to upgrade. Following this grace period, the minimum python version supported in the SDK will be updated.

The SDK can be installed with *uv*, *pip*, or *poetry* package managers.

### uv

*uv* is a fast Python package installer and resolver, designed as a drop-in replacement for pip and pip-tools. It's recommended for its speed and modern Python tooling capabilities.

```bash
uv add git+<UNSET>.git
```

### PIP

*PIP* is the default package installer for Python, enabling easy installation and management of packages from PyPI via the command line.

```bash
pip install git+<UNSET>.git
```

### Poetry

*Poetry* is a modern tool that simplifies dependency management and package publishing by using a single `pyproject.toml` file to handle project metadata and dependencies.

```bash
poetry add git+<UNSET>.git
```

### Shell and script usage with `uv`

You can use this SDK in a Python shell with [uv](https://docs.astral.sh/uv/) and the `uvx` command that comes with it like so:

```shell
uvx --from autumn-sdk python
```

It's also possible to write a standalone Python script without needing to set up a whole project like so:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "autumn-sdk",
# ]
# ///

from autumn_sdk import Autumn

sdk = Autumn(
  # SDK arguments
)

# Rest of script here...
```

Once that is saved to a file, you can run it with `uv run script.py` where
`script.py` can be replaced with the actual file name.
<!-- End SDK Installation [installation] -->

<!-- Start IDE Support [idesupport] -->
## IDE Support

### PyCharm

Generally, the SDK will work well with most IDEs out of the box. However, when using PyCharm, you can enjoy much better integration with Pydantic by installing an additional plugin.

- [PyCharm Pydantic Plugin](https://docs.pydantic.dev/latest/integrations/pycharm/)
<!-- End IDE Support [idesupport] -->

<!-- Start SDK Example Usage [usage] -->
## SDK Example Usage

### Example

```python
# Synchronous Example
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)
```

</br>

The same SDK client can also be used to make asynchronous requests by importing asyncio.

```python
# Asynchronous Example
import asyncio
from autumn_sdk import Autumn

async def main():

    async with Autumn(
        x_api_version="2.1",
        secret_key="<YOUR_BEARER_TOKEN_HERE>",
    ) as autumn:

        res = await autumn.check_async(customer_id="cus_123", feature_id="messages")

        # Handle response
        print(res)

asyncio.run(main())
```
<!-- End SDK Example Usage [usage] -->

<!-- Start Authentication [security] -->
## Authentication

### Per-Client Security Schemes

This SDK supports the following security scheme globally:

| Name         | Type | Scheme      |
| ------------ | ---- | ----------- |
| `secret_key` | http | HTTP Bearer |

To authenticate with the API the `secret_key` parameter must be set when initializing the SDK client instance. For example:
```python
from autumn_sdk import Autumn


with Autumn(
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
    x_api_version="2.1",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)

```
<!-- End Authentication [security] -->

<!-- Start Available Resources and Operations [operations] -->
## Available Resources and Operations

<details open>
<summary>Available methods</summary>

### [Autumn SDK](docs/sdks/autumn/README.md)

* [check](docs/sdks/autumn/README.md#check) - Checks whether a customer currently has enough balance to use a feature.

Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.
* [track](docs/sdks/autumn/README.md#track) - Records usage for a customer feature and returns updated balances.

Use this after an action happens to decrement usage, or send a negative value to credit balance back.

### [Balances](docs/sdks/balances/README.md)

* [create](docs/sdks/balances/README.md#create) - Create a balance for a customer feature.
* [update](docs/sdks/balances/README.md#update) - Update a customer balance.

### [Billing](docs/sdks/billing/README.md)

* [attach](docs/sdks/billing/README.md#attach) - Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.

Use this endpoint to subscribe a customer to a plan, upgrade/downgrade between plans, or add an add-on product.
* [preview_attach](docs/sdks/billing/README.md#preview_attach) - Previews the billing changes that would occur when attaching a plan, without actually making any changes.

Use this endpoint to show customers what they will be charged before confirming a subscription change.
* [update](docs/sdks/billing/README.md#update) - Updates an existing subscription. Use to modify feature quantities, cancel, or change plan configuration.

Use this endpoint to update prepaid quantities, cancel a subscription (immediately or at end of cycle), or modify subscription settings.
* [preview_update](docs/sdks/billing/README.md#preview_update) - Previews the billing changes that would occur when updating a subscription, without actually making any changes.

Use this endpoint to show customers prorated charges or refunds before confirming subscription modifications.
* [open_customer_portal](docs/sdks/billing/README.md#open_customer_portal) - Create a billing portal session for a customer to manage their subscription.
* [setup_payment](docs/sdks/billing/README.md#setup_payment) - Create a payment setup session for a customer to add or update their payment method.

### [Customers](docs/sdks/customers/README.md)

* [get_or_create](docs/sdks/customers/README.md#get_or_create) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.
* [list](docs/sdks/customers/README.md#list) - Lists customers with pagination and optional filters.
* [update](docs/sdks/customers/README.md#update) - Updates an existing customer by ID.
* [delete](docs/sdks/customers/README.md#delete) - Deletes a customer by ID.

### [Entities](docs/sdks/entities/README.md)

* [create](docs/sdks/entities/README.md#create) - Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.

Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.
* [get](docs/sdks/entities/README.md#get) - Fetches an entity by its ID.

Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.
* [delete](docs/sdks/entities/README.md#delete) - Deletes an entity by entity ID.

Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.

### [Events](docs/sdks/events/README.md)

* [list](docs/sdks/events/README.md#list) - List usage events for your organization. Filter by customer, feature, or time range.
* [aggregate](docs/sdks/events/README.md#aggregate) - Aggregate usage events by time period. Returns usage totals grouped by feature and optionally by a custom property.

### [Features](docs/sdks/features/README.md)

* [create](docs/sdks/features/README.md#create) - Creates a new feature.

Use this to programmatically create features for metering usage, managing access, or building credit systems.
* [get](docs/sdks/features/README.md#get) - Retrieves a single feature by its ID.

Use this when you need to fetch the details of a specific feature.
* [list](docs/sdks/features/README.md#list) - Lists all features in the current environment.

Use this to retrieve all features configured for your organization to display in dashboards or for feature management.
* [update](docs/sdks/features/README.md#update) - Updates an existing feature.

Use this to modify feature properties like name, display settings, or to archive a feature.
* [delete](docs/sdks/features/README.md#delete) - Deletes a feature by its ID.

Use this to permanently remove a feature. Note: features that are used in products cannot be deleted - archive them instead.

### [Plans](docs/sdks/plans/README.md)

* [create](docs/sdks/plans/README.md#create) - Create a plan
* [get](docs/sdks/plans/README.md#get) - Get a plan
* [list](docs/sdks/plans/README.md#list) - List all plans
* [update](docs/sdks/plans/README.md#update) - Update a plan
* [delete](docs/sdks/plans/README.md#delete) - Delete a plan

### [Referrals](docs/sdks/referrals/README.md)

* [create_code](docs/sdks/referrals/README.md#create_code) - Create or fetch a referral code for a customer in a referral program.
* [redeem_code](docs/sdks/referrals/README.md#redeem_code) - Redeem a referral code for a customer.

</details>
<!-- End Available Resources and Operations [operations] -->

<!-- Start Retries [retries] -->
## Retries

Some of the endpoints in this SDK support retries. If you use the SDK without any configuration, it will fall back to the default retry strategy provided by the API. However, the default retry strategy can be overridden on a per-operation basis, or across the entire SDK.

To change the default retry strategy for a single API call, simply provide a `RetryConfig` object to the call:
```python
from autumn_sdk import Autumn
from autumn_sdk.utils import BackoffStrategy, RetryConfig


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages",
        RetryConfig("backoff", BackoffStrategy(1, 50, 1.1, 100), False))

    # Handle response
    print(res)

```

If you'd like to override the default retry strategy for all operations that support retries, you can use the `retry_config` optional parameter when initializing the SDK:
```python
from autumn_sdk import Autumn
from autumn_sdk.utils import BackoffStrategy, RetryConfig


with Autumn(
    retry_config=RetryConfig("backoff", BackoffStrategy(1, 50, 1.1, 100), False),
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)

```
<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->
## Error Handling

[`AutumnError`](./src/autumn_sdk/errors/autumnerror.py) is the base class for all HTTP error responses. It has the following properties:

| Property           | Type             | Description                                            |
| ------------------ | ---------------- | ------------------------------------------------------ |
| `err.message`      | `str`            | Error message                                          |
| `err.status_code`  | `int`            | HTTP response status code eg `404`                     |
| `err.headers`      | `httpx.Headers`  | HTTP response headers                                  |
| `err.body`         | `str`            | HTTP body. Can be empty string if no body is returned. |
| `err.raw_response` | `httpx.Response` | Raw HTTP response                                      |

### Example
```python
from autumn_sdk import Autumn, errors


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:
    res = None
    try:

        res = autumn.check(customer_id="cus_123", feature_id="messages")

        # Handle response
        print(res)


    except errors.AutumnError as e:
        # The base class for HTTP error responses
        print(e.message)
        print(e.status_code)
        print(e.body)
        print(e.headers)
        print(e.raw_response)

```

### Error Classes
**Primary error:**
* [`AutumnError`](./src/autumn_sdk/errors/autumnerror.py): The base class for HTTP error responses.

<details><summary>Less common errors (5)</summary>

<br />

**Network errors:**
* [`httpx.RequestError`](https://www.python-httpx.org/exceptions/#httpx.RequestError): Base class for request errors.
    * [`httpx.ConnectError`](https://www.python-httpx.org/exceptions/#httpx.ConnectError): HTTP client was unable to make a request to a server.
    * [`httpx.TimeoutException`](https://www.python-httpx.org/exceptions/#httpx.TimeoutException): HTTP request timed out.


**Inherit from [`AutumnError`](./src/autumn_sdk/errors/autumnerror.py)**:
* [`ResponseValidationError`](./src/autumn_sdk/errors/responsevalidationerror.py): Type mismatch between the response data and the expected Pydantic model. Provides access to the Pydantic validation error via the `cause` attribute.

</details>
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->
## Server Selection

### Override Server URL Per-Client

The default server can be overridden globally by passing a URL to the `server_url: str` optional parameter when initializing the SDK client instance. For example:
```python
from autumn_sdk import Autumn


with Autumn(
    server_url="http://localhost:8080",
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.check(customer_id="cus_123", feature_id="messages")

    # Handle response
    print(res)

```
<!-- End Server Selection [server] -->

<!-- Start Custom HTTP Client [http-client] -->
## Custom HTTP Client

The Python SDK makes API calls using the [httpx](https://www.python-httpx.org/) HTTP library.  In order to provide a convenient way to configure timeouts, cookies, proxies, custom headers, and other low-level configuration, you can initialize the SDK client with your own HTTP client instance.
Depending on whether you are using the sync or async version of the SDK, you can pass an instance of `HttpClient` or `AsyncHttpClient` respectively, which are Protocol's ensuring that the client has the necessary methods to make API calls.
This allows you to wrap the client with your own custom logic, such as adding custom headers, logging, or error handling, or you can just pass an instance of `httpx.Client` or `httpx.AsyncClient` directly.

For example, you could specify a header for every request that this sdk makes as follows:
```python
from autumn_sdk import Autumn
import httpx

http_client = httpx.Client(headers={"x-custom-header": "someValue"})
s = Autumn(client=http_client)
```

or you could wrap the client with your own custom logic:
```python
from autumn_sdk import Autumn
from autumn_sdk.httpclient import AsyncHttpClient
import httpx

class CustomClient(AsyncHttpClient):
    client: AsyncHttpClient

    def __init__(self, client: AsyncHttpClient):
        self.client = client

    async def send(
        self,
        request: httpx.Request,
        *,
        stream: bool = False,
        auth: Union[
            httpx._types.AuthTypes, httpx._client.UseClientDefault, None
        ] = httpx.USE_CLIENT_DEFAULT,
        follow_redirects: Union[
            bool, httpx._client.UseClientDefault
        ] = httpx.USE_CLIENT_DEFAULT,
    ) -> httpx.Response:
        request.headers["Client-Level-Header"] = "added by client"

        return await self.client.send(
            request, stream=stream, auth=auth, follow_redirects=follow_redirects
        )

    def build_request(
        self,
        method: str,
        url: httpx._types.URLTypes,
        *,
        content: Optional[httpx._types.RequestContent] = None,
        data: Optional[httpx._types.RequestData] = None,
        files: Optional[httpx._types.RequestFiles] = None,
        json: Optional[Any] = None,
        params: Optional[httpx._types.QueryParamTypes] = None,
        headers: Optional[httpx._types.HeaderTypes] = None,
        cookies: Optional[httpx._types.CookieTypes] = None,
        timeout: Union[
            httpx._types.TimeoutTypes, httpx._client.UseClientDefault
        ] = httpx.USE_CLIENT_DEFAULT,
        extensions: Optional[httpx._types.RequestExtensions] = None,
    ) -> httpx.Request:
        return self.client.build_request(
            method,
            url,
            content=content,
            data=data,
            files=files,
            json=json,
            params=params,
            headers=headers,
            cookies=cookies,
            timeout=timeout,
            extensions=extensions,
        )

s = Autumn(async_client=CustomClient(httpx.AsyncClient()))
```
<!-- End Custom HTTP Client [http-client] -->

<!-- Start Resource Management [resource-management] -->
## Resource Management

The `Autumn` class implements the context manager protocol and registers a finalizer function to close the underlying sync and async HTTPX clients it uses under the hood. This will close HTTP connections, release memory and free up other resources held by the SDK. In short-lived Python programs and notebooks that make a few SDK method calls, resource management may not be a concern. However, in longer-lived programs, it is beneficial to create a single SDK instance via a [context manager][context-manager] and reuse it across the application.

[context-manager]: https://docs.python.org/3/reference/datamodel.html#context-managers

```python
from autumn_sdk import Autumn
def main():

    with Autumn(
        x_api_version="2.1",
        secret_key="<YOUR_BEARER_TOKEN_HERE>",
    ) as autumn:
        # Rest of application here...


# Or when using async:
async def amain():

    async with Autumn(
        x_api_version="2.1",
        secret_key="<YOUR_BEARER_TOKEN_HERE>",
    ) as autumn:
        # Rest of application here...
```
<!-- End Resource Management [resource-management] -->

<!-- Start Debugging [debug] -->
## Debugging

You can setup your SDK to emit debug logs for SDK requests and responses.

You can pass your own logger class directly into your SDK.
```python
from autumn_sdk import Autumn
import logging

logging.basicConfig(level=logging.DEBUG)
s = Autumn(debug_logger=logging.getLogger("autumn_sdk"))
```
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

### SDK Created by [Speakeasy](https://www.speakeasy.com/?utm_source=autumn-sdk&utm_campaign=python)
