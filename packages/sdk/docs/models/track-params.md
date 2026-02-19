# TrackParams

## Example Usage

```typescript
import { TrackParams } from "@useautumn/sdk";

let value: TrackParams = {
  customerId: "cus_123",
  featureId: "messages",
  value: 1,
};
```

## Fields

| Field                                                                                                                  | Type                                                                                                                   | Required                                                                                                               | Description                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `customerId`                                                                                                           | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | The ID of the customer.                                                                                                |
| `featureId`                                                                                                            | *string*                                                                                                               | :heavy_minus_sign:                                                                                                     | The ID of the feature to track usage for. Required if event_name is not provided.                                      |
| `entityId`                                                                                                             | *string*                                                                                                               | :heavy_minus_sign:                                                                                                     | The ID of the entity for entity-scoped balances (e.g., per-seat limits).                                               |
| `eventName`                                                                                                            | *string*                                                                                                               | :heavy_minus_sign:                                                                                                     | Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. |
| `value`                                                                                                                | *number*                                                                                                               | :heavy_minus_sign:                                                                                                     | The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat).      |
| `properties`                                                                                                           | Record<string, *any*>                                                                                                  | :heavy_minus_sign:                                                                                                     | Additional properties to attach to this usage event.                                                                   |