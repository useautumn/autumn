# PreviewAttachPlanSchedule

When the plan change should take effect. 'immediate' applies now, 'end_of_cycle' schedules for the end of the current billing cycle. By default, upgrades are immediate and downgrades are scheduled.

## Example Usage

```typescript
import { PreviewAttachPlanSchedule } from "@useautumn/sdk";

let value: PreviewAttachPlanSchedule = "end_of_cycle";
```

## Values

```typescript
"immediate" | "end_of_cycle"
```