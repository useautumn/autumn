# BillingAttachPlanSchedule

When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.

## Example Usage

```typescript
import { BillingAttachPlanSchedule } from "@useautumn/sdk";

let value: BillingAttachPlanSchedule = "immediate";
```

## Values

```typescript
"immediate" | "end_of_cycle"
```