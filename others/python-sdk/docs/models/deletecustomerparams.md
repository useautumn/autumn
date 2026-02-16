# DeleteCustomerParams


## Fields

| Field                                         | Type                                          | Required                                      | Description                                   |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `customer_id`                                 | *str*                                         | :heavy_check_mark:                            | ID of the customer to delete                  |
| `delete_in_stripe`                            | *Optional[bool]*                              | :heavy_minus_sign:                            | Whether to also delete the customer in Stripe |