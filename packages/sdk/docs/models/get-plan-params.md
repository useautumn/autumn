# GetPlanParams

## Example Usage

```typescript
import { GetPlanParams } from "@useautumn/sdk";

let value: GetPlanParams = {
  planId: "pro_plan",
};
```

## Fields

| Field                                                           | Type                                                            | Required                                                        | Description                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `planId`                                                        | *string*                                                        | :heavy_check_mark:                                              | The ID of the plan to retrieve.                                 |
| `version`                                                       | *number*                                                        | :heavy_minus_sign:                                              | The version of the plan to get. Defaults to the latest version. |