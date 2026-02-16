# Code

## Example Usage

```typescript
import { Code } from "@useautumn/sdk";

let value: Code = "3ds_required";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"3ds_required" | "payment_method_required" | "payment_failed" | Unrecognized<string>
```