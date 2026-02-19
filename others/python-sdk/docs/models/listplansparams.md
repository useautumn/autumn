# ListPlansParams


## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `customer_id`                                                                  | *Optional[str]*                                                                | :heavy_minus_sign:                                                             | Customer ID to include eligibility info (trial availability, attach scenario). |
| `entity_id`                                                                    | *Optional[str]*                                                                | :heavy_minus_sign:                                                             | Entity ID for entity-scoped plans.                                             |
| `include_archived`                                                             | *Optional[bool]*                                                               | :heavy_minus_sign:                                                             | If true, includes archived plans in the response.                              |