# Customers

## Overview

### Available Operations

* [get_or_create](#get_or_create) - Creates a customer if they do not exist, or returns the existing customer by your external customer ID.

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

## get_or_create

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

<!-- UsageSnippet language="python" operationID="getOrCreate" method="post" path="/v1/customers.getOrCreate" -->
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