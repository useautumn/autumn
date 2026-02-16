# ListCustomersResponse

OK


## Fields

| Field                                              | Type                                               | Required                                           | Description                                        |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `list`                                             | List[[models.ListT](../models/listt.md)]           | :heavy_check_mark:                                 | Array of items for current page                    |
| `has_more`                                         | *bool*                                             | :heavy_check_mark:                                 | Whether more results exist after this page         |
| `offset`                                           | *float*                                            | :heavy_check_mark:                                 | Current offset position                            |
| `limit`                                            | *float*                                            | :heavy_check_mark:                                 | Limit passed in the request                        |
| `total`                                            | *float*                                            | :heavy_check_mark:                                 | Total number of items returned in the current page |