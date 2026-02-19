# BinSize

Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day

## Example Usage

```typescript
import { BinSize } from "@useautumn/sdk";

let value: BinSize = "day";
```

## Values

```typescript
"day" | "hour" | "month"
```