export default `---
name: autumn-modelling-pricing-plans
description: |
  Helps design pricing models for Autumn using the autumn.config.ts configuration file.
  Use this skill when:
  - Designing pricing tiers, plans, or features for Autumn
  - Creating autumn.config.ts configuration
  - Setting up usage-based, subscription, or credit-based pricing
  - Configuring features like API calls, seats, storage, or credits
  - Understanding Autumn feature types (single_use, continuous_use, boolean, credit_system)
  - Working with plan items, metered billing, or tiered pricing
---

# Autumn Pricing Model Design

This guide helps you design your pricing model for Autumn. Autumn uses a configuration file (\`autumn.config.ts\`) to define your features and products (plans).

## Step 1: Understand Your Pricing Needs

Before building, consider:

1. What features do you want to offer? (API calls, seats, storage, etc.)
2. What plans do you want? (Free, Pro, Enterprise tiers?)
3. How should usage be measured and limited?

## Feature Types

Autumn supports these feature types:

| Type | Description | Examples |
|------|-------------|----------|
| \`single_use\` | Consumable resources | API calls, tokens, messages, credits, generations |
| \`continuous_use\` | Non-consumable resources | Seats, workspaces, projects, team members |
| \`boolean\` | On/off features | Advanced analytics, priority support, SSO |
| \`credit_system\` | Unified credit pool that maps to multiple single_use features | Credits redeemable for various actions |

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

## Guidelines

### Naming Conventions

- Product and Feature IDs should be lowercase with underscores (e.g., \`pro_plan\`, \`chat_messages\`)

### Features vs Plan Features

- Features define WHAT can be tracked (e.g., "credits")
- Plan features define HOW a feature is granted in a plan (recurring, one-time, free, paid)
- Never create duplicate features for the same underlying resource
  - Example: "monthly tokens" and "one-time tokens" should be the SAME feature ("tokens"), referenced by different plan items with different intervals

### Default Plans

- **Never** set \`is_default: true\` for plans with prices
- Default plans must be free

### Enterprise Plans

- Ignore "Enterprise" plans with custom pricing in the config
- Custom plans can be created per-customer in the Autumn dashboard

### Annual Plans

- For annual variants, create a separate plan with annual price interval
- Name it \`<plan_name> - Annual\`

### Currency

- Currency can be changed in the Autumn dashboard under Developer > Stripe

## Example Configuration

\`\`\`typescript
import { feature, plan, item } from "atmn";

// Features
export const messages = feature({
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
});

export const seats = feature({
	id: "seats",
	name: "Team Seats",
	type: "metered",
	consumable: false,
});

// Plans
export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({ featureId: messages.id, included: 100 }),
		item({ featureId: seats.id, included: 1 }),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: {
		amount: 29,
		interval: "month",
	},
	items: [
		item({
			featureId: seats.id,
			included: 5,
			price: {
				amount: 10,
				interval: "month",
				billingMethod: "usage_based",
			},
		}),
		item({
			featureId: messages.id,
			included: 10_000,
			entityFeatureId: seats.id,
			price: {
				amount: 0.01,
				interval: "month",
				billingMethod: "usage_based",
			},
		}),
	],
});
\`\`\`

## Next Steps

Once you've designed your pricing:

1. Update \`autumn.config.ts\` with your features and plans
2. Run \`atmn preview\` to lint, validate and preview your plans - make sure to show the user the output to ensure they're happy with the results.
3. Run \`atmn push\` to sync your configuration to Autumn
4. Test in sandbox mode before going live

## Resources

- Discord support: https://discord.gg/atmn (very responsive)
- Documentation: https://docs.useautumn.com
- LLM-friendly docs: https://docs.useautumn.com/llms.txt
`;
