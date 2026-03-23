---
name: autumn-gating
description: |
  Add usage tracking and feature gating with the Autumn SDK.
  Use this skill when asked to:
  - Add usage tracking or metering
  - Implement feature limits or gating
  - Check feature access or entitlements
  - Track API calls, messages, or other usage
  - Implement credit systems
  - Add paywalls or upgrade prompts
  - Enforce usage limits server-side
---

# Checking and Tracking Usage

Autumn handles your customer's payments and grants them the features defined in your plan configuration. There are 2 functions you need to enforce limits and gating:

- `check` for feature access, before allowing a user to do something
- `track` the usage in Autumn afterwards (if needed)

> Your Autumn configuration is in `autumn.config.ts`. If it doesn't exist, run `npx atmn init` to log in and generate the file.

## Step 1: Detect Integration Type

Check if the codebase already has Autumn set up:

- If there's an `AutumnProvider` and `autumnHandler` mounted -> **React hooks available** (can use for UX)
- Backend SDK should **always** be used to enforce limits server-side

Report what you detected before proceeding.

---

## Checking Feature Access

Check if a user has enough remaining balance before executing an action. The `feature_id` used here is defined by you when you create the feature in Autumn.

### Backend Check (Required for Security)

**Always check on the backend** before executing any protected action. Frontend checks can be bypassed.

**TypeScript:**

```typescript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const { allowed } = await autumn.check({
  customerId: "user_or_org_id_from_auth",
  featureId: "messages",
  requiredBalance: 1,
});

if (!allowed) {
  console.log("User has run out of messages");
  return;
}
```

**Python:**

```python
from autumn_sdk import Autumn

autumn = Autumn('am_sk_test_xxx')

response = await autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="messages",
    required_balance=1,
)

if not response.allowed:
    raise HTTPException(status_code=403, detail="Usage limit reached")
```

**cURL:**

```bash
curl -X POST 'https://api.useautumn.com/v1/check' \
  -H 'Authorization: Bearer am_sk_test_xxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "feature_id": "messages",
    "required_balance": 1
  }'
```

You can also use `check` to gate boolean features (non-metered features), such as access to "premium AI models".

### Frontend Check (React Hooks - UX Only)

When using React hooks, you have access to the customer object which you can use to display billing data. You can use the client-side `check` function to gate features and show paywalls. Permissions are determined by reading the local `data` state, so no call to Autumn's API is made.

```tsx
import { useCustomer } from "autumn-js/react";

export function SendChatMessage() {
  const { check, refetch } = useCustomer();

  const handleSendMessage = async () => {
    const { allowed } = check({ featureId: "messages" });

    if (!allowed) {
      alert("You're out of messages");
    } else {
      // Send chatbot message
      // Then refresh customer usage data
      await refetch();
    }
  };
}
```

---

## Tracking Usage

After the user has successfully used a feature, record the usage in Autumn. This will decrement their balance.

**TypeScript:**

```typescript
await autumn.track({
  customerId: "user_or_org_id_from_auth",
  featureId: "messages",
  value: 1,
});
```

**Python:**

```python
await autumn.track(
    customer_id="user_or_org_id_from_auth",
    feature_id="messages",
    value=1,
)
```

**cURL:**

```bash
curl -X POST 'https://api.useautumn.com/v1/track' \
  -H 'Authorization: Bearer am_sk_test_xxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "user_or_org_id_from_auth",
    "feature_id": "messages",
    "value": 1
  }'
```

You should always handle access checks and usage tracking server-side for security. Users can manipulate client-side code using devtools.

---

## Key Concepts

- **Frontend checks** = UX (show/hide UI, display limits) - can be bypassed by users
- **Backend checks** = Security (enforce limits) - required before any protected action
- **Pattern**: check -> do work -> track (only track after successful completion)
- Feature IDs come from the Autumn configuration
- Current usage and total limit are available from the Customer object

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

The `required_balance` parameter converts the number of messages to credits. For example, passing `required_balance: 5` for basic messages returns `allowed: true` if the user has at least 0.05 USD credits remaining.

**Important:** Interact with the underlying features (`basic_messages`, `premium_messages`) - not the credit system directly.

#### React

```tsx
import { useCustomer } from "autumn-js/react";

export function CheckBasicMessage() {
  const { check, refetch } = useCustomer();

  const handleCheckAccess = async () => {
    const { allowed } = check({ featureId: "basic_messages", requiredBalance: 1 });

    if (!allowed) {
      alert("You've run out of basic message credits");
    } else {
      // proceed with sending message
      await refetch();
    }
  };
}
```

#### TypeScript

```typescript
const { allowed } = await autumn.check({
  customerId: "user_or_org_id_from_auth",
  featureId: "basic_messages",
  requiredBalance: 1,
});

if (!allowed) {
  console.log("User has run out of basic message credits");
  return;
}
```

#### Python

```python
response = await autumn.check(
    customer_id="user_or_org_id_from_auth",
    feature_id="basic_messages",
    required_balance=1,
)

if not response.allowed:
    print("User has run out of basic message credits")
    return
```

### Tracking Usage with Credits

```typescript
await autumn.track({
  customerId: "user_or_org_id_from_auth",
  featureId: "basic_messages",
  value: 2,
});
```

This uses 2 basic messages, which costs 0.02 USD credits.

---

**Note:** Autumn configuration is typically in `autumn.config.ts` in the project root.

**Docs:** https://docs.useautumn.com/llms.txt
