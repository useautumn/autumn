export default `---
name: autumn-tracking-metered-usage
description: |
  Add usage tracking and feature gating with Autumn SDK. Use this skill when asked to:
  - Add usage tracking or metering
  - Implement feature limits or gating
  - Check feature access or entitlements
  - Track API calls, messages, or other usage
  - Implement credit systems
  - Add paywalls or upgrade prompts
  - Enforce usage limits server-side
---

# Autumn Usage & Gating

Autumn tracks feature usage and enforces limits. This skill covers adding usage tracking and gating to a codebase.

## Step 1: Detect Integration Type

Check if the codebase already has Autumn set up:

- If there's an \`AutumnProvider\` and \`autumnHandler\` mounted -> **React hooks available** (can use for UX)
- Backend SDK should **always** be used to enforce limits server-side

Report what you detected before proceeding.

---

## Frontend Checks (React Hooks)

Use frontend checks for **UX only** - showing/hiding features, prompting upgrades. These should NOT be trusted for security.

### Check Feature Access

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export function SendChatMessage() {
  const { check, refetch } = useCustomer();

  const handleSendMessage = async () => {
    const { data } = check({ featureId: "messages" });

    if (!data?.allowed) {
      alert("You're out of messages");
    } else {
      // send chatbot message
      // then, refresh customer usage data
      await refetch();
    }
  };
}
\`\`\`

---

## Backend Checks (Required for Security)

**Always check on the backend** before executing any protected action. Frontend checks can be bypassed.

### TypeScript

\`\`\`typescript
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
\`\`\`

### Python

\`\`\`python
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
\`\`\`

---

## Key Concepts

- **Frontend checks** = UX (show/hide UI, display limits) - can be bypassed by users
- **Backend checks** = Security (enforce limits) - required before any protected action
- **Pattern**: check -> do work -> track (only track after successful completion)
- Feature IDs come from the Autumn configuration
- Current usage and total limit are available from the Customer object

### Displaying Usage Info

\`\`\`tsx
import type { Customer } from "autumn-js";

// Balance is: customer.features.<feature_name>.balance
\`\`\`

**Note:** Autumn configuration is typically in \`autumn.config.ts\` in the project root.

**Docs:** https://docs.useautumn.com/llms.txt

---

## Credit Systems Reference

Grant users a currency-based balance of credits that various features can draw from. When you have multiple features that cost different amounts, use a credit system to deduct usage from a single balance.

### Example Case

AI chatbot product with 2 different models:

- Basic message: $1 per 100 messages
- Premium message: $10 per 100 messages

Plans:

- Free tier: $5 credits per month for free
- Pro tier: $10 credits per month, at $10 per month

### Checking Access with Credits

The \`required_balance\` parameter converts the number of messages to credits. For example, passing \`required_balance: 5\` for basic messages returns \`allowed: true\` if the user has at least 0.05 USD credits remaining.

**Important:** Interact with the underlying features (\`basic_messages\`, \`premium_messages\`) - not the credit system directly.

#### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export function CheckBasicMessage() {
  const { check, refetch } = useCustomer();

  const handleCheckAccess = async () => {
    const { data } = await check({ featureId: "basic_messages", requiredBalance: 1 });

    if (!data?.allowed) {
      alert("You've run out of basic message credits");
    } else {
      // proceed with sending message
      await refetch();
    }
  };
}
\`\`\`

#### TypeScript

\`\`\`typescript
const { data } = await autumn.check({
  customer_id: "user_or_org_id_from_auth",
  feature_id: "basic_messages",
  required_balance: 1,
});

if (!data.allowed) {
  console.log("User has run out of basic message credits");
  return;
}
\`\`\`

#### Python

\`\`\`python
response = await autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="basic_messages",
    required_balance=1,
)

if not response.allowed:
    print("User has run out of basic message credits")
    return
\`\`\`

### Tracking Usage with Credits

\`\`\`typescript
await autumn.track({
  customer_id: "user_or_org_id_from_auth",
  feature_id: "basic_messages",
  value: 2,
});
\`\`\`

This uses 2 basic messages, which costs 0.02 USD credits.
`;
