# CreateFeatureDisplayResponse

Display names for the feature in billing UI and customer-facing components.

## Example Usage

```typescript
import { CreateFeatureDisplayResponse } from "@useautumn/sdk";

let value: CreateFeatureDisplayResponse = {};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `singular`                                               | *string*                                                 | :heavy_minus_sign:                                       | Singular form for UI display (e.g., 'API call', 'seat'). |
| `plural`                                                 | *string*                                                 | :heavy_minus_sign:                                       | Plural form for UI display (e.g., 'API calls', 'seats'). |