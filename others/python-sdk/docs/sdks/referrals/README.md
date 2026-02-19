# Referrals

## Overview

### Available Operations

* [create_code](#create_code) - Create or fetch a referral code for a customer in a referral program.
* [redeem_code](#redeem_code) - Redeem a referral code for a customer.

## create_code

Create or fetch a referral code for a customer in a referral program.

### Example Usage

<!-- UsageSnippet language="python" operationID="createReferralCode" method="post" path="/v1/referrals.create_code" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.referrals.create_code(customer_id="cus_123", program_id="prog_123")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `customer_id`                                                       | *str*                                                               | :heavy_check_mark:                                                  | The unique identifier of the customer                               |
| `program_id`                                                        | *str*                                                               | :heavy_check_mark:                                                  | ID of your referral program                                         |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.CreateReferralCodeResponse](../../models/createreferralcoderesponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |

## redeem_code

Redeem a referral code for a customer.

### Example Usage

<!-- UsageSnippet language="python" operationID="redeemReferralCode" method="post" path="/v1/referrals.redeem_code" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.referrals.redeem_code(code="REF123", customer_id="cus_456")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                           | Type                                                                | Required                                                            | Description                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `code`                                                              | *str*                                                               | :heavy_check_mark:                                                  | The referral code to redeem                                         |
| `customer_id`                                                       | *str*                                                               | :heavy_check_mark:                                                  | The unique identifier of the customer redeeming the code            |
| `retries`                                                           | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)    | :heavy_minus_sign:                                                  | Configuration to override the default retry behavior of the client. |

### Response

**[models.RedeemReferralCodeResponse](../../models/redeemreferralcoderesponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |