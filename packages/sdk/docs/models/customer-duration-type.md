# CustomerDurationType

How long the discount lasts

## Example Usage

```typescript
import { CustomerDurationType } from "@useautumn/sdk";

let value: CustomerDurationType = "months";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"one_off" | "months" | "forever" | Unrecognized<string>
```