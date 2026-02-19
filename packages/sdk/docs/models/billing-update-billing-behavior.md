# BillingUpdateBillingBehavior

How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle.

## Example Usage

```typescript
import { BillingUpdateBillingBehavior } from "@useautumn/sdk";

let value: BillingUpdateBillingBehavior = "next_cycle_only";
```

## Values

```typescript
"prorate_immediately" | "next_cycle_only"
```