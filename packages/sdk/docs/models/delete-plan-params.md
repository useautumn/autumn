# DeletePlanParams

## Example Usage

```typescript
import { DeletePlanParams } from "@useautumn/sdk";

let value: DeletePlanParams = {
  planId: "unused_plan",
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `planId`                                                                               | *string*                                                                               | :heavy_check_mark:                                                                     | The ID of the plan to delete.                                                          |
| `allVersions`                                                                          | *boolean*                                                                              | :heavy_minus_sign:                                                                     | If true, deletes all versions of the plan. Otherwise, only deletes the latest version. |