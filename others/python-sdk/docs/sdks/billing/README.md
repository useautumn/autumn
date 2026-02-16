# Billing

## Overview

### Available Operations

* [attach](#attach)

## attach

### Example Usage

<!-- UsageSnippet language="python" operationID="attach" method="post" path="/v1/attach" -->
```python
from autumn_sdk import Autumn


with Autumn(
    x_api_version="2.1",
    secret_key="<YOUR_BEARER_TOKEN_HERE>",
) as autumn:

    res = autumn.billing.attach(product_id="<id>", redirect_mode="always")

    # Handle response
    print(res)

```

### Parameters

| Parameter                                                                   | Type                                                                        | Required                                                                    | Description                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `product_id`                                                                | *str*                                                                       | :heavy_check_mark:                                                          | N/A                                                                         |
| `options`                                                                   | List[[models.Options](../../models/options.md)]                             | :heavy_minus_sign:                                                          | N/A                                                                         |
| `version`                                                                   | *Optional[float]*                                                           | :heavy_minus_sign:                                                          | N/A                                                                         |
| `free_trial`                                                                | [OptionalNullable[models.AttachFreeTrial]](../../models/attachfreetrial.md) | :heavy_minus_sign:                                                          | N/A                                                                         |
| `items`                                                                     | List[[models.AttachItem](../../models/attachitem.md)]                       | :heavy_minus_sign:                                                          | N/A                                                                         |
| `invoice`                                                                   | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | N/A                                                                         |
| `enable_product_immediately`                                                | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | N/A                                                                         |
| `finalize_invoice`                                                          | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | N/A                                                                         |
| `redirect_mode`                                                             | [Optional[models.RedirectMode]](../../models/redirectmode.md)               | :heavy_minus_sign:                                                          | N/A                                                                         |
| `success_url`                                                               | *Optional[str]*                                                             | :heavy_minus_sign:                                                          | N/A                                                                         |
| `new_billing_subscription`                                                  | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | N/A                                                                         |
| `plan_schedule`                                                             | [Optional[models.PlanSchedule]](../../models/planschedule.md)               | :heavy_minus_sign:                                                          | N/A                                                                         |
| `billing_behavior`                                                          | [Optional[models.BillingBehavior]](../../models/billingbehavior.md)         | :heavy_minus_sign:                                                          | N/A                                                                         |
| `adjustable_quantity`                                                       | *Optional[bool]*                                                            | :heavy_minus_sign:                                                          | N/A                                                                         |
| `retries`                                                                   | [Optional[utils.RetryConfig]](../../models/utils/retryconfig.md)            | :heavy_minus_sign:                                                          | Configuration to override the default retry behavior of the client.         |

### Response

**[models.AttachResponse](../../models/attachresponse.md)**

### Errors

| Error Type                | Status Code               | Content Type              |
| ------------------------- | ------------------------- | ------------------------- |
| errors.AutumnDefaultError | 4XX, 5XX                  | \*/\*                     |