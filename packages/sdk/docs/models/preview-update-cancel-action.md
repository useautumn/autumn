# PreviewUpdateCancelAction

Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation.

## Example Usage

```typescript
import { PreviewUpdateCancelAction } from "@useautumn/sdk";

let value: PreviewUpdateCancelAction = "uncancel";
```

## Values

```typescript
"cancel_immediately" | "cancel_end_of_cycle" | "uncancel"
```