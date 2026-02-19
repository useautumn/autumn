# PlanDurationType

Unit of time for the trial duration ('day', 'month', 'year').

## Example Usage

```typescript
import { PlanDurationType } from "@useautumn/sdk";

let value: PlanDurationType = "month";
```

## Values

This is an open enum. Unrecognized values will be captured as the `Unrecognized<string>` branded type.

```typescript
"day" | "month" | "year" | Unrecognized<string>
```