# ListPlansParams

## Example Usage

```typescript
import { ListPlansParams } from "@useautumn/sdk";

let value: ListPlansParams = {};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `customerId`                                                                   | *string*                                                                       | :heavy_minus_sign:                                                             | Customer ID to include eligibility info (trial availability, attach scenario). |
| `entityId`                                                                     | *string*                                                                       | :heavy_minus_sign:                                                             | Entity ID for entity-scoped plans.                                             |
| `includeArchived`                                                              | *boolean*                                                                      | :heavy_minus_sign:                                                             | If true, includes archived plans in the response.                              |