# Range

Time range to aggregate events for. Either range or custom_range must be provided

## Example Usage

```typescript
import { Range } from "@useautumn/sdk";

let value: Range = "7d";
```

## Values

```typescript
"24h" | "7d" | "30d" | "90d" | "last_cycle" | "1bc" | "3bc"
```