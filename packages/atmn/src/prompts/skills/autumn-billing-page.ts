export default `---
name: autumn-billing-page
description: |
  Build a billing page and manage subscriptions with Autumn.
  Use this skill when the user wants to:
  - Display active plans or subscription status
  - Show usage balances to customers
  - Build a pricing page with upgrade/downgrade buttons
  - Implement plan switching (upgrades/downgrades)
  - Add cancel/uncancel subscription functionality
  - Open the Stripe billing portal
  - Display usage history charts
  - Add prepaid top-ups or credit purchases
---

# Build Your Billing Page

Software applications typically ship with a billing page. This allows customers to change plan, cancel subscription and view their usage.

> Your Autumn configuration is in \`autumn.config.ts\`. If it doesn't exist, run \`npx atmn init\` to log in and generate the file.

## Step 1: Detect Integration Type

Check if the codebase already has Autumn set up:

- If there's an \`AutumnProvider\` and \`autumnHandler\` mounted: **Path A: React**
- If there's just an \`Autumn\` client initialized: **Path B: Backend SDK**

Before implementing:

1. Tell the user which path you'll follow before proceeding.
2. Tell them you will be building billing page components, and ask for any guidance or input.

---

## Active Plans

Display the plan the user is currently on. Users can have multiple active subscriptions and purchases (e.g., main plan and add-ons).

- **\`subscriptions\`** - Free and paid recurring plans
- **\`purchases\`** - One-off plans (e.g., credit top-ups)

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { data: customer } = useCustomer();

const active = customer?.subscriptions.filter(
  (sub) => sub.status === "active"
);

console.log(active?.map((sub) => sub.planId).join(", "));
\`\`\`

### TypeScript

\`\`\`typescript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_test_xxx" });

const customer = await autumn.customers.getOrCreate({
  customerId: "user_123",
});

const active = customer.subscriptions?.filter(
  (sub) => sub.status === "active"
);

console.log(active?.map((sub) => sub.planId).join(", "));
\`\`\`

### Python

\`\`\`python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_xxx")

customer = await autumn.customers.get_or_create(
    customer_id="user_123"
)

active = [s for s in customer.subscriptions if s.status == "active"]
print([s.plan_id for s in active])
\`\`\`

---

## Usage Balances

Metered features have \`granted\`, \`usage\`, and \`remaining\` fields. Use these to display current usage and remaining balance.

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { data: customer, refetch } = useCustomer();

const messages = customer?.balances.messages;

console.log(\\\`\\\${messages?.remaining} / \\\${messages?.granted}\\\`);

// After tracking usage or changing plans, call refetch() to update balances
await refetch();
\`\`\`

### TypeScript

\`\`\`typescript
const customer = await autumn.customers.getOrCreate({
  customerId: "user_123",
});

const messages = customer.balances?.messages;
console.log(\\\`\\\${messages?.remaining} / \\\${messages?.granted}\\\`);
\`\`\`

### Python

\`\`\`python
customer = await autumn.customers.get_or_create(
    customer_id="user_123"
)

messages = customer.balances.get("messages")
print(f"{messages.remaining} / {messages.granted}")
\`\`\`

---

## Customer Eligibility

When building a pricing page, you need to know what each plan means for the current customer -- is it an upgrade, a downgrade, or their current plan? Is a free trial available?

Pass a \`customerId\` when listing plans and each plan will include a \`customerEligibility\` object:

- **\`scenario\`** -- The attach scenario: \`new\`, \`upgrade\`, \`downgrade\`, \`active\`, \`scheduled\`, \`cancel\`, \`expired\`, \`past_due\`, or \`renew\`
- **\`trialAvailable\`** -- Whether the customer is eligible for the plan's free trial

### React

\`\`\`tsx
import { useListPlans, useCustomer } from "autumn-js/react";

const buttonText = {
  new: "Get started",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  active: "Current plan",
};

export default function PricingPage() {
  const { data: plans } = useListPlans();
  const { attach } = useCustomer();

  return plans?.map((plan) => (
    <button
      key={plan.id}
      disabled={plan.customerEligibility?.scenario === "active"}
      onClick={() => attach({ planId: plan.id })}
    >
      {buttonText[plan.customerEligibility?.scenario] ?? "Get started"}
    </button>
  ));
}
\`\`\`

The React \`useListPlans\` hook automatically includes customer context from \`AutumnProvider\`, so \`customerEligibility\` is populated on every plan without extra configuration.

### TypeScript

\`\`\`typescript
const { list: plans } = await autumn.plans.list({
  customerId: "user_123",
});

for (const plan of plans) {
  console.log(plan.name, plan.customerEligibility?.scenario);
  // e.g. "Free" "downgrade", "Pro" "active", "Enterprise" "upgrade"
}
\`\`\`

### Python

\`\`\`python
plans = await autumn.plans.list(customer_id="user_123")

for plan in plans.list:
    print(plan.name, plan.customer_eligibility.scenario)
\`\`\`

---

## Switching Plans

Use \`attach\` to switch between plans. This handles upgrades, downgrades, and new subscriptions.

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export default function UpgradeButton() {
  const { attach } = useCustomer();

  return (
    <button onClick={() => attach({ planId: "pro" })}>
      Upgrade to Pro
    </button>
  );
}
\`\`\`

### TypeScript

\`\`\`typescript
const response = await autumn.billing.attach({
  customerId: "user_123",
  planId: "pro",
});

redirect(response.paymentUrl);
\`\`\`

### Python

\`\`\`python
response = await autumn.billing.attach(
    customer_id="user_123",
    plan_id="pro",
)
# Redirect to response.payment_url
\`\`\`

---

## Cancelling a Plan

Cancel a subscription using \`billing.update\` with a \`cancelAction\`.

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { updateSubscription } = useCustomer();

// Cancel at end of billing cycle
await updateSubscription({
  planId: "pro",
  cancelAction: "cancel_end_of_cycle",
});
\`\`\`

### TypeScript

\`\`\`typescript
await autumn.billing.update({
  customerId: "user_123",
  planId: "pro",
  cancelAction: "cancel_end_of_cycle",
});
\`\`\`

### Python

\`\`\`python
await autumn.billing.update(
    customer_id="user_123",
    plan_id="pro",
    cancel_action="cancel_end_of_cycle",
)
\`\`\`

---

## Uncancelling a Plan

If a subscription has a pending cancellation (when \`canceledAt\` is not null while the subscription is still \`active\`), you can reverse it:

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export default function BillingPage() {
  const { data: customer, updateSubscription } = useCustomer();

  const cancellingSub = customer?.subscriptions.find(
    (sub) => sub.status === "active" && sub.canceledAt !== null
  );

  return cancellingSub ? (
    <button onClick={() => updateSubscription({
      planId: cancellingSub.planId,
      cancelAction: "uncancel"
    })}>
      Keep plan
    </button>
  ) : null;
}
\`\`\`

### TypeScript

\`\`\`typescript
const customer = await autumn.customers.getOrCreate({
  customerId: "user_123",
});

const cancellingSub = customer.subscriptions?.find(
  (sub) => sub.status === "active" && sub.canceledAt !== null
);

if (cancellingSub) {
  await autumn.billing.update({
    customerId: "user_123",
    planId: cancellingSub.planId,
    cancelAction: "uncancel",
  });
}
\`\`\`

### Python

\`\`\`python
customer = await autumn.customers.get_or_create(
    customer_id="user_123"
)

cancelling_sub = next(
    (s for s in customer.subscriptions
     if s.status == "active" and s.canceled_at is not None),
    None,
)

if cancelling_sub:
    await autumn.billing.update(
        customer_id="user_123",
        plan_id=cancelling_sub.plan_id,
        cancel_action="uncancel",
    )
\`\`\`

---

## Stripe Billing Portal

The Stripe billing portal lets users manage their payment method, view past invoices, and cancel their plan. Enable the billing portal in your Stripe settings first.

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { openCustomerPortal } = useCustomer();

await openCustomerPortal({
  returnUrl: "https://your-app.com/billing"
});
\`\`\`

### TypeScript

\`\`\`typescript
const { url } = await autumn.billing.openCustomerPortal({
  customerId: "user_123",
  returnUrl: "https://your-app.com/billing",
});

redirect(url);
\`\`\`

### Python

\`\`\`python
response = await autumn.billing.open_customer_portal(
    customer_id="user_123",
    return_url="https://your-app.com/billing",
)
# Redirect to response.url
\`\`\`

---

## Usage History Chart

Autumn provides aggregate time series queries for usage data. Pass the response to a charting library like Recharts.

### React

\`\`\`tsx
import { useAggregateEvents } from "autumn-js/react";

const { list, total } = useAggregateEvents({
  featureId: "messages",
  range: "30d",
});

// list: [{ period: 1234567890, values: { messages: 42 } }, ...]
// total: { messages: { count: 100, sum: 500 } }
\`\`\`

### TypeScript

\`\`\`typescript
const { list, total } = await autumn.events.aggregate({
  customerId: "user_123",
  featureId: "messages",
  range: "30d",
});
\`\`\`

### Python

\`\`\`python
response = await autumn.events.aggregate(
    customer_id="user_123",
    feature_id="messages",
    range="30d",
)
# response.list, response.total
\`\`\`

---

## Prepaid Top-ups Reference

Let customers purchase prepaid packages and top-ups. If a user hits a usage limit, they may be willing to purchase a top-up. These are typically one-time purchases that grant a fixed amount of usage.

### React

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

export default function TopUpButton() {
  const { attach } = useCustomer();

  return (
    <button
      onClick={async () => {
        await attach({
          planId: "top_up",
          options: [{
            featureId: "messages",
            quantity: 200,
          }],
        });
      }}
    >
      Buy More Messages
    </button>
  );
}
\`\`\`

### TypeScript

\`\`\`typescript
const response = await autumn.billing.attach({
  customerId: "user_or_org_id_from_auth",
  planId: "top_up",
  options: [{
    featureId: "messages",
    quantity: 200,
  }],
});

if (response.paymentUrl) {
  redirect(response.paymentUrl);
}
\`\`\`

### Python

\`\`\`python
response = await autumn.billing.attach(
    customer_id="user_or_org_id_from_auth",
    plan_id="top_up",
    options=[{
        "feature_id": "messages",
        "quantity": 200,
    }],
)
\`\`\`

---

## Important Notes

- This handles all upgrades, downgrades, renewals, and uncancellations automatically
- Plan IDs come from the Autumn configuration
- Your Autumn configuration is in \`autumn.config.ts\` in your project root

**Docs:** https://docs.useautumn.com/llms.txt
`;
