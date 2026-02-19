# PreviewAttachFreeTrial

## Example Usage

```typescript
import { PreviewAttachFreeTrial } from "@useautumn/sdk";

let value: PreviewAttachFreeTrial = {
  durationLength: 4611.12,
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `durationLength`                                                                       | *number*                                                                               | :heavy_check_mark:                                                                     | Number of duration_type periods the trial lasts.                                       |
| `durationType`                                                                         | [models.PreviewAttachDurationType](../models/preview-attach-duration-type.md)          | :heavy_minus_sign:                                                                     | Unit of time for the trial ('day', 'month', 'year').                                   |
| `cardRequired`                                                                         | *boolean*                                                                              | :heavy_minus_sign:                                                                     | If true, payment method required to start trial. Customer is charged after trial ends. |