# CheckEnv

The environment of the product

## Example Usage

```typescript
import { CheckEnv } from "@useautumn/sdk";

let value: CheckEnv = "live";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"sandbox" | "live" | Unrecognized<string>
```