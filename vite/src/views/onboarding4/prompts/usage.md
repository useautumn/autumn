## Add Autumn gating and usage tracking

Autumn tracks feature usage and enforces limits. Add usage tracking to this codebase.

### Step 1: Detect my integration type

Check if this codebase already has Autumn set up:
- If there's an `AutumnProvider` and `autumnHandler` mounted → **React hooks available** (can use for UX)
- Backend SDK should **always** be used to enforce limits server-side

Tell me what you detected before proceeding.

---

## Frontend checks (React hooks)

Use frontend checks for **UX only** - showing/hiding features, prompting upgrades. These should NOT be trusted for security.

### Check feature access
```tsx
import { useCustomer } from "autumn-js/react";

export function SendChatMessage() {
	const { check, refetch } = useCustomer();

	const handleSendMessage = async () => {
		const { data } = check({ featureId: "messages" });

		if (!data?.allowed) {
			alert("You're out of messages");
		} else {
			//send chatbot message
			//then, refresh customer usage data
			await refetch();
		}
	};
}
```

---

## Backend checks (required for security)

**Always check on the backend** before executing any protected action. Frontend checks can be bypassed.

### TypeScript
```typescript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

// Check before executing the action
const { data } = await autumn.check({
  customer_id: "user_or_org_id_from_auth",
  feature_id: "api_calls",
});

if (!data.allowed) {
  return { error: "Usage limit reached" };
}

// Safe to proceed - do the actual work here
const result = await doTheActualWork();

// Track usage after success
await autumn.track({
  customer_id: "user_or_org_id_from_auth",
  feature_id: "api_calls",
  value: 1,
});

return result;
```

### Python
```python
from autumn import Autumn

autumn = Autumn('am_sk_test_xxx')

# Check before executing the action
response = await autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls"
)

if not response.allowed:
    raise HTTPException(status_code=403, detail="Usage limit reached")

# Safe to proceed - do the actual work here
result = await do_the_actual_work()

# Track usage after success
await autumn.track(
    customer_id="user_or_org_id_from_auth",
    feature_id="api_calls",
    value=1
)

return result
```

---

## Notes

- **Frontend checks** = UX (show/hide UI, display limits) - can be bypassed by users
- **Backend checks** = Security (enforce limits) - required before any protected action
- Pattern: check → do work → track (only track after successful completion)
- Feature IDs come from the Autumn configuration (below)
- Current usage and total limit can be taken from from Customer object and displayed -- see the Customer types from the Autumn SDK
```tsx
import type { Customer } from "autumn-js";

//Balance is: customer.features.<feature_name>.balance
```
{{CREDIT_SYSTEM_NOTE}}
Docs: https://docs.useautumn.com/llms.txt

---

## Current Autumn Configuration
{{AUTUMN_CONFIG}}
