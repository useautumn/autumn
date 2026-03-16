export const pricingPrompt = `## Design your Autumn pricing model

This guide helps you design your pricing model for Autumn. Autumn uses a configuration file (\`autumn.config.ts\`) to define your features and products (plans).

### Step 1: Understand your pricing needs

Before building, consider:
1. What features do you want to offer? (API calls, seats, storage, etc.)
2. What plans do you want? (Free, Pro, Enterprise tiers?)
3. How should usage be measured and limited?

---

## Feature Types

Autumn supports these feature types:

- **single_use**: Consumable resources (API calls, tokens, messages, credits, generations)
- **continuous_use**: Non-consumable resources (seats, workspaces, projects, team members)
- **boolean**: On/off features (advanced analytics, priority support, SSO)
- **credit_system**: A unified credit pool that maps to multiple single_use features

---

## Item Types

Products contain an array of items. There are distinct item patterns:

### 1. Flat Fee (standalone price, no feature)
\`\`\`typescript
{ feature_id: null, price: 13, interval: "month" }
\`\`\`
Customer pays $13/month as a base subscription fee.

### 2. Free Feature Allocation (feature grant, no price)
\`\`\`typescript
{ feature_id: "credits", included_usage: 10000 }
\`\`\`
Customer gets 10,000 credits included.

### 3. Metered/Usage-Based Pricing
\`\`\`typescript
{ feature_id: "credits", included_usage: 10000, price: 0.01, usage_model: "pay_per_use", interval: "month" }
\`\`\`
Customer can use 10,000 credits per month, then pays $0.01 per credit after that.

### 4. Prepaid Credit Purchase (one-time purchase of usage)
\`\`\`typescript
{ feature_id: "credits", price: 10, usage_model: "prepaid", billing_units: 10000 }
\`\`\`
Customer pays $10 once to receive 10,000 credits.

### 5. Tiered Pricing
\`\`\`typescript
{ feature_id: "api_calls", included_usage: 1000, tiers: [{ to: 5000, amount: 0.02 }, { to: "inf", amount: 0.01 }], usage_model: "pay_per_use", interval: "month" }
\`\`\`
Customer gets 1,000 API calls free, then pays $0.02/call up to 5,000, then $0.01/call after that.

### 6. Per-Unit Pricing Structure
For any "per-X" pricing (like "$Y per seat", "$Y per project", "$Y per website"), use this pattern:
\`\`\`typescript
// Base subscription fee
{ feature_id: null, price: 10, interval: "month" }
// Unit allocation
{ feature_id: "seats", included_usage: 1, price: 10, usage_model: "pay_per_use", billing_units: 1 }
\`\`\`
This creates: $10/month base price that includes 1 unit, then $10 per additional unit purchased.

**Always** use this two-item pattern for any per-unit pricing - never use pure per-unit without a base fee.

---

## Guidelines

### Naming Conventions
- Product and Feature IDs should be lowercase with underscores (e.g., \`pro_plan\`, \`chat_messages\`)

### Features vs Plan Features
- Features define WHAT can be tracked (e.g., "credits"). Plan features define HOW a feature is granted in a plan (recurring, one-time, free, paid).
- Never create duplicate features for the same underlying resource. For example, "monthly tokens" and "one-time tokens" should be the SAME feature ("tokens"), referenced by different plan items with different intervals.

### Default Plans
- **Never** set \`is_default: true\` for plans with prices. Default plans must be free.

### Enterprise Plans
- Ignore "Enterprise" plans with custom pricing in the config. Custom plans can be created per-customer in the Autumn dashboard.

### Annual Plans
- For annual variants, create a separate plan with annual price interval. Name it \`<plan_name> - Annual\`.

### Currency
- Currency can be changed in the Autumn dashboard under Developer > Stripe.

---

## Example Configuration

\`\`\`typescript
import { feature, plan, item } from "atmn";

// Features
export const messages = feature({
  id: "messages",
  name: "Messages",
  type: "single_use",
});

export const seats = feature({
  id: "seats", 
  name: "Team Seats",
  type: "continuous_use",
});

// Plans
export const free = plan({
  id: "free",
  name: "Free",
  is_default: true,
  items: [
    item({ featureId: "messages", included: 100 }),
    item({ featureId: "seats", included: 1 }),
  ],
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  items: [
    item({ featureId: null, price: 29, interval: "month" }),
    item({ featureId: "messages", included: 10000, price: 0.01, usage_model: "pay_per_use" }),
    item({ featureId: "seats", included: 5, price: 10, usage_model: "pay_per_use", billingUnits: 1 }),
  ],
});
\`\`\`

---

## Next Steps

Once you've designed your pricing:
1. Update \`autumn.config.ts\` with your features and plans
2. Run \`atmn push\` to sync your configuration to Autumn
3. Test in sandbox mode before going live

For more help: https://discord.gg/atmn (we're very responsive)

For questions about specific functionality or advanced use cases, check out the documentation: https://docs.useautumn.com

Docs: https://docs.useautumn.com/llms.txt`;
