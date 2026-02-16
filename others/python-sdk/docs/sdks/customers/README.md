# Customers

## Overview

### Available Operations

* [get_or_create](#get_or_create) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.
* [list](#list) - Lists customers with pagination and optional filters.
* [update](#update) - Updates an existing customer by ID.
* [delete](#delete) - Deletes a customer by ID.

## get_or_create

Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

### Example Usage

<!-- UsageSnippet language="python" operationID="getOrCreateCustomer" method="post" path="/v1/customers.getOrCreate" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.customers.get_or_create(customer_id="cus_123", name="John Doe", email="john@example.com")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                        | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `customer_id`                                                                                    | *Nullable[str]*                                                                                  | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `name`                                                                                           | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Customer's name                                                                                  |
| `email`                                                                                          | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Customer's email address                                                                         |
| `fingerprint`                                                                                    | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse |
| `metadata`                                                                                       | Dict[str, *Any*]                                                                                 | :heavy_minus_sign:                                                                               | Additional metadata for the customer                                                             |
| `stripe_id`                                                                                      | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Stripe customer ID if you already have one                                                       |
| `create_in_stripe`                                                                               | *Optional[bool]*                                                                                 | :heavy_minus_sign:                                                                               | Whether to create the customer in Stripe                                                         |
| `auto_enable_plan_id`                                                                            | *Optional[str]*                                                                                  | :heavy_minus_sign:                                                                               | The ID of the free plan to auto-enable for the customer                                          |
| `send_email_receipts`                                                                            | *Optional[bool]*                                                                                 | :heavy_minus_sign:                                                                               | Whether to send email receipts to this customer                                                  |
| `expand`                                                                                         | List[[models.CustomerExpand](../../models/customerexpand.md)]                                    | :heavy_minus_sign:                                                                               | Customer expand options                                                                          |
| `retries`                                                                                        | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                 | :heavy_minus_sign:                                                                               | Configuration to override the default retry behavior of the client.                              |

### Response

**[models.Customer](../../models/customer.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## list

Lists customers with pagination and optional filters.

### Example Usage

<!-- UsageSnippet language="python" operationID="listCustomers" method="post" path="/v1/customers.list" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.customers.list(request={})

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `request`                                                           | [models.ListCustomersParams](../../models/listcustomersparams.md)   | :heavy_check_mark:                                                  | The request object to use for the request.                          |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.ListCustomersResponse](../../models/listcustomersresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## update

Updates an existing customer by ID.

### Example Usage

<!-- UsageSnippet language="python" operationID="updateCustomer" method="post" path="/v1/customers.update" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.customers.update(customer_id="cus_123", name="Jane Doe", email="jane@example.com")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                                        | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `customer_id`                                                                                    | *str*                                                                                            | :heavy_check_mark:                                                                               | ID of the customer to update                                                                     |
| `name`                                                                                           | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Customer's name                                                                                  |
| `email`                                                                                          | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Customer's email address                                                                         |
| `fingerprint`                                                                                    | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse |
| `metadata`                                                                                       | Dict[str, *Any*]                                                                                 | :heavy_minus_sign:                                                                               | Additional metadata for the customer                                                             |
| `stripe_id`                                                                                      | *OptionalNullable[str]*                                                                          | :heavy_minus_sign:                                                                               | Stripe customer ID if you already have one                                                       |
| `send_email_receipts`                                                                            | *Optional[bool]*                                                                                 | :heavy_minus_sign:                                                                               | Whether to send email receipts to this customer                                                  |
| `new_customer_id`                                                                                | *Optional[str]*                                                                                  | :heavy_minus_sign:                                                                               | Your unique identifier for the customer                                                          |
| `retries`                                                                                        | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)                                 | :heavy_minus_sign:                                                                               | Configuration to override the default retry behavior of the client.                              |

### Response

**[models.UpdateCustomerResponse](../../models/updatecustomerresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## delete

Deletes a customer by ID.

### Example Usage

<!-- UsageSnippet language="python" operationID="deleteCustomer" method="post" path="/v1/customers.delete" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.customers.delete(customer_id="cus_123", delete_in_stripe=False)

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `customer_id`                                                       | *str*                                                               | :heavy_check_mark:                                                  | ID of the customer to delete                                        |
| `delete_in_stripe`                                                  | *Optional[bool]*                                                    | :heavy_minus_sign:                                                  | Whether to also delete the customer in Stripe                       |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.DeleteCustomerResponse](../../models/deletecustomerresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |