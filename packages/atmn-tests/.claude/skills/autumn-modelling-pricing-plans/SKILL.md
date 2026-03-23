---
name: autumn-modelling-pricing-plans
description: |
  Helps design pricing models for Autumn using the autumn.config.ts configuration file.
  Use this skill when:
  - Designing pricing tiers, plans, or features for Autumn
  - Creating autumn.config.ts configuration
  - Setting up usage-based, subscription, or credit-based pricing
  - Configuring features like API calls, seats, storage, or credits
  - Understanding Autumn feature types (metered, boolean, credit_system)
  - Working with plan items, metered billing, or tiered pricing
---

# Autumn Pricing Model Design

This guide helps you design your pricing model for Autumn. Autumn uses a configuration file (`autumn.config.ts`) to define your features and plans.

> **Before starting:** Check for an `autumn.config.ts` in the project root. If it doesn't exist, run `npx atmn init` to log in and generate the file. If you already have a config you want to modify, run `atmn pull` to sync it from Autumn first.

## Step 1: Understand Your Pricing Needs

Before building, consider:

1. What features do you want to offer? (API calls, seats, storage, etc.)
2. What plans do you want? (Free, Pro, etc.)
3. How should usage be measured and limited?

---

## Features

Features define what can be gated, metered, or billed in your app.

### `feature(config)`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier used in API calls (`check`, `track`, etc). |
| `name` | string | Yes | Display name shown in the dashboard and billing UI. |
| `type` | enum | Yes | `"boolean"` \| `"metered"` \| `"credit_system"` |
| `consumable` | boolean | For metered | `true` = consumed (messages, API calls), `false` = ongoing (seats, storage). |
| `eventNames` | string[] | No | Event names that trigger this feature. Allows multiple features to respond to a single event. |
| `creditSchema` | array | For credit_system | Maps metered features to credit costs. Each entry: `{ meteredFeatureId, creditCost }`. |

### Feature Types

**Boolean** -- simple on/off flag:

```typescript
export const sso = feature({
  id: 'sso',
  name: 'SSO Authentication',
  type: 'boolean',
});
```

**Metered, consumable** -- used up and replenished (messages, API calls):

```typescript
export const messages = feature({
  id: 'messages',
  name: 'Messages',
  type: 'metered',
  consumable: true,
});
```

**Metered, non-consumable** -- ongoing usage (seats, storage):

```typescript
export const seats = feature({
  id: 'seats',
  name: 'Seats',
  type: 'metered',
  consumable: false,
});
```

**Credit system** -- maps multiple metered features to credit costs:

```typescript
export const basicModel = feature({
  id: 'basic_model',
  name: 'Basic Model',
  type: 'metered',
  consumable: true,
});

export const premiumModel = feature({
  id: 'premium_model',
  name: 'Premium Model',
  type: 'metered',
  consumable: true,
});

export const credits = feature({
  id: 'credits',
  name: 'AI Credits',
  type: 'credit_system',
  creditSchema: [
    { meteredFeatureId: basicModel.id, creditCost: 1 },
    { meteredFeatureId: premiumModel.id, creditCost: 5 },
  ],
});
```

If you set the price per credit to 1 cent, credits become monetary credits (eg, 5 credits = $0.05 per premium message).

---

## Plans

Plans combine features with pricing to create your subscription tiers, add-ons, and top-ups.

### `plan(config)`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier used in checkout and subscription APIs. |
| `name` | string | Yes | Display name shown in pricing tables and billing. |
| `price` | object | No | Base subscription price: `{ amount, interval }`. |
| `items` | array | No | Array of `item()` objects defining what's included. |
| `autoEnable` | boolean | No | Automatically assign to new customers. Typically used for free plans. |
| `addOn` | boolean | No | Allow purchase alongside other plans (instead of replacing them). |
| `freeTrial` | object | No | `{ durationLength, durationType, cardRequired }`. |
| `group` | string | No | Group related plans. Plans in the same group replace each other on upgrade/downgrade. |

Price intervals: `"month"` | `"quarter"` | `"semi_annual"` | `"year"` | `"one_off"`

Trial duration types: `"day"` | `"month"` | `"year"`

---

## Plan Items

Plan items define what each plan includes -- usage limits, pricing, and billing behavior.

### `item(config)`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `featureId` | string | Yes | The `id` of the feature to include. |
| `included` | number | No | Amount included for free. Omit for boolean features. |
| `unlimited` | boolean | No | Grant unlimited usage of this feature. |
| `reset` | object | No | How often the included amount resets: `{ interval, intervalCount? }`. |
| `price` | object | No | Pricing for usage beyond the included amount. |
| `proration` | object | No | Mid-cycle changes: `{ onIncrease, onDecrease }`. |
| `rollover` | object | No | Carry unused balance: `{ max, expiryDurationType, expiryDurationLength }`. |

Reset intervals: `"hour"` | `"day"` | `"week"` | `"month"` | `"quarter"` | `"semi_annual"` | `"year"`

Proration options:
- `onIncrease`: `"prorate"` | `"charge_immediately"`
- `onDecrease`: `"prorate"` | `"refund_immediately"` | `"no_action"`

---

## Pricing Patterns

The `price` object on a plan item supports different billing models.

### Usage-based -- charge based on actual usage

```typescript
item({
  featureId: seats.id,
  included: 5,
  price: {
    amount: 10,
    interval: 'month',
    billingMethod: 'usage_based',
    billingUnits: 1,
  },
})
```

### Prepaid -- customer buys a fixed quantity upfront

```typescript
item({
  featureId: credits.id,
  price: {
    amount: 5,
    billingUnits: 100,
    billingMethod: 'prepaid',
  },
})
```

### Tiered -- price changes based on usage volume

```typescript
item({
  featureId: apiCalls.id,
  price: {
    tiers: [
      { to: 1000, amount: 0.01 },
      { to: 10000, amount: 0.008 },
      { to: 'inf', amount: 0.005 },
    ],
    billingMethod: 'usage_based',
    interval: 'month',
  },
})
```

### Price Fields Reference

| Param | Type | Description |
|-------|------|-------------|
| `amount` | number | Price per `billingUnits`. Mutually exclusive with `tiers`. |
| `tiers` | array | Tiered pricing. Each entry: `{ to: number \| "inf", amount }`. Mutually exclusive with `amount`. |
| `billingMethod` | enum | `"usage_based"` \| `"prepaid"`. Required. |
| `interval` | enum | `"week"` \| `"month"` \| `"quarter"` \| `"semi_annual"` \| `"year"`. Omit for one-time charges. |
| `billingUnits` | number | Units per price (default 1). Eg, $5 per 100 credits = `amount: 5, billingUnits: 100`. |
| `maxPurchase` | number | Maximum quantity that can be purchased. |

---

## Common Patterns

### Free Plan with Usage Limits

```typescript
export const free = plan({
  id: 'free',
  name: 'Free',
  autoEnable: true,
  items: [
    item({
      featureId: messages.id,
      included: 5,
      reset: { interval: 'month' },
    }),
    item({
      featureId: seats.id,
      included: 1,
    }),
  ],
});
```

### Paid Plan with Flat Fee + Overage

```typescript
export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: messages.id,
      included: 1000,
      reset: { interval: 'month' },
      price: {
        amount: 0.01,
        interval: 'month',
        billingMethod: 'usage_based',
      },
    }),
  ],
});
```

### Per-Unit Pricing (e.g., per seat)

For any "per-X" pricing (like "$Y per seat"), use a base fee + unit allocation:

```typescript
export const team = plan({
  id: 'team',
  name: 'Team',
  price: { amount: 10, interval: 'month' },
  items: [
    item({
      featureId: seats.id,
      included: 1,
      price: {
        amount: 10,
        interval: 'month',
        billingMethod: 'usage_based',
        billingUnits: 1,
      },
    }),
  ],
});
```

This creates: $10/month base price that includes 1 seat, then $10 per additional seat.

### Plan with Free Trial

```typescript
export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  freeTrial: {
    durationLength: 14,
    durationType: 'day',
    cardRequired: true,
  },
  items: [
    item({ featureId: messages.id, included: 1000, reset: { interval: 'month' } }),
    item({ featureId: sso.id }),
  ],
});
```

### Add-on / Top-up (One-time Prepaid)

```typescript
export const topUp = plan({
  id: 'top_up',
  name: 'Message Top-Up',
  addOn: true,
  items: [
    item({
      featureId: messages.id,
      price: {
        amount: 5,
        billingUnits: 100,
        billingMethod: 'prepaid',
      },
    }),
  ],
});
```

### Annual Plan Variant

For annual variants, create a separate plan with annual price interval:

```typescript
export const proAnnual = plan({
  id: 'pro_annual',
  name: 'Pro - Annual',
  group: 'pro',
  price: { amount: 192, interval: 'year' },
  items: [
    item({ featureId: messages.id, included: 1000, reset: { interval: 'month' } }),
  ],
});
```

---

## Full Example

A complete config with a free plan, a paid plan with a trial, and a credits top-up add-on:

```typescript
// autumn.config.ts
import { feature, item, plan } from 'atmn';

// Features
export const messages = feature({
  id: 'messages',
  name: 'Messages',
  type: 'metered',
  consumable: true,
});

export const seats = feature({
  id: 'seats',
  name: 'Seats',
  type: 'metered',
  consumable: false,
});

export const sso = feature({
  id: 'sso',
  name: 'SSO',
  type: 'boolean',
});

// Plans
export const free = plan({
  id: 'free',
  name: 'Free',
  autoEnable: true,
  items: [
    item({
      featureId: messages.id,
      included: 5,
      reset: { interval: 'month' },
    }),
    item({
      featureId: seats.id,
      included: 1,
    }),
  ],
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  freeTrial: {
    durationLength: 14,
    durationType: 'day',
    cardRequired: true,
  },
  items: [
    item({
      featureId: messages.id,
      included: 1000,
      reset: { interval: 'month' },
    }),
    item({
      featureId: seats.id,
      included: 5,
      price: {
        amount: 10,
        interval: 'month',
        billingMethod: 'usage_based',
        billingUnits: 1,
      },
    }),
    item({
      featureId: sso.id,
    }),
  ],
});

export const topUp = plan({
  id: 'top_up',
  name: 'Message Top-Up',
  addOn: true,
  items: [
    item({
      featureId: messages.id,
      price: {
        amount: 5,
        billingUnits: 100,
        billingMethod: 'prepaid',
      },
    }),
  ],
});
```

---

## Guidelines

### Start Simple

- If the user describes more than 3 features, start with the 3 most important (prioritize metered features) and ask them to confirm before adding more
- Inform them you kept it simple to start with, but they can add more later

### Disambiguate Pricing Model

- When the user mentions a price for a feature, ask whether it should be **usage-based** (pay as you go, billed at the end of the cycle) or **prepaid** (buy a fixed quantity upfront)
- Don't assume one or the other without asking

### Don't Fabricate Capabilities

- If the user asks about pricing or functionality you're not sure Autumn supports, do NOT make it up or assume it can be done
- Point them to Discord (https://discord.gg/atmn) or docs (https://docs.useautumn.com/llms.txt) instead

### Naming Conventions

- Feature and plan IDs should be lowercase with underscores (e.g., `pro_plan`, `chat_messages`)

### Features vs Plan Items

- Features define WHAT can be tracked (e.g., "credits")
- Plan items define HOW a feature is granted in a plan (recurring, one-time, free, paid)
- Never create duplicate features for the same underlying resource
  - Example: "monthly tokens" and "one-time tokens" should be the SAME feature ("tokens"), referenced by different plan items with different intervals

### Default Plans

- **Never** set `autoEnable: true` for plans with prices
- Default plans must be free

### Enterprise Plans

- Ignore "Enterprise" plans with custom pricing in the config
- Custom plans can be created per-customer in the Autumn dashboard

### Currency

- Currency can be changed in the Autumn dashboard under Developer > Stripe

## Previewing and Pushing Changes

After updating `autumn.config.ts`:

1. **Preview first**: Run `atmn preview` to lint, validate and preview your plans. Show the output to the user so they can review the full configuration.
2. **Get confirmation**: Ask the user to review, edit, and confirm the preview output before pushing. Do NOT push until the user explicitly confirms.
3. **Push**: Once the user is happy, run `atmn push` to sync the configuration to Autumn.
4. Test in sandbox mode before going live. You can push to production with `atmn push -p`.

## Resources

- Discord support: https://discord.gg/atmn (very responsive)
- Documentation: https://docs.useautumn.com
- LLM-friendly docs: https://docs.useautumn.com/llms.txt
