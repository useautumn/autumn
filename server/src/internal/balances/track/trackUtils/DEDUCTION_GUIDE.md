# Balance Deduction System Guide

## Overview
The balance deduction system handles iterative deduction from customer entitlements using PostgreSQL stored functions for atomicity and performance.

## Core Deduction Logic

### Where Deductions Happen
- **Balance Level**: Direct deduction from `customer_entitlements.balance`
- **Entity Balance Level**: Deduction from `customer_entitlements.entities` JSONB field

### Sorting Customer Entitlements
Customer entitlements are sorted **before** deduction to ensure consistent deduction order. Sorting logic is in `sortCusEntsForDeduction.ts` and considers:
- Boolean flags (unlimited, active status)
- Feature types (metered vs license)
- Allowance types (quota vs time-based)
- Dates (expiration, next reset)
- Intervals
- Product types
- Creation dates

**Why?** Ensures predictable deduction order (e.g., expiring credits first, then active subscriptions).

## Key Parameters

### Input Structure
```typescript
{
  customer_entitlement_id: string;
  credit_cost: number;              // Multiplier for credit system features
  entity_feature_id: string | null; // If present, deduct from entities
  usage_allowed: boolean;           // Can balance go negative?
  min_balance: number;              // Minimum balance limit (e.g., -50)
  add_to_adjustment: boolean;       // Track adjustment for billing
}
```

### Deduction Behavior

#### 1. **usage_allowed**
- `false`: Balance stops at 0 (default)
- `true`: Balance can go negative (usage-based billing)

#### 2. **min_balance**
- Works with `usage_allowed = true`
- Prevents balance from going below this threshold
- Example: `balance = 100, min_balance = -50` → can deduct up to 150

#### 3. **credit_cost**
- Multiplies deduction amount for credit system features
- Example: Deducting 10 units with `credit_cost = 2` → deducts 20 from balance

#### 4. **add_to_adjustment**
- When `true`, updates `customer_entitlements.adjustment` field
- Tracks cumulative adjustments: `adjustment = adjustment + deducted`
- Used for billing reconciliation (see `handleUpdateBalances.ts`)

## Entity-Scoped Deductions

### Single Entity (entity_id provided)
- Deducts from specific entity in `entities` JSONB
- Example: `entities = { "org1": { "balance": 100 } }`
- Deducts from `entities.org1.balance`

### All Entities (entity_id = null)
- Iterates through each entity key in `entities`
- Deducts sequentially until amount satisfied or all entities exhausted
- Example: Deduct 150 from `{ "org1": { "balance": 100 }, "org2": { "balance": 100 } }`
  - Result: `{ "org1": { "balance": 0 }, "org2": { "balance": 50 } }`

## Return Structure

```typescript
{
  updates: {
    [cusEntId]: {
      balance: number;
      entities: JSONB;
      adjustment: number;
      deducted: number;
    }
  },
  remaining: number  // Amount that couldn't be deducted
}
```

## Overage Behavior

### reject (default)
- If `remaining > 0`, throws error
- Use when strict balance enforcement required

### cap
- Allows partial deduction
- Returns successfully with `remaining` amount

## Billing Integration

After deduction, system automatically:
1. Calculates negative balance changes
2. Calls `adjustAllowance` for each updated entitlement
3. Bills customer on Stripe if overage increased
4. Rolls back transaction on any error

## Transaction Safety

- All deductions run in `read committed` transaction
- Automatic rollback on any error
- Cache refresh only after successful transaction
- Ensures consistency between DB and Stripe

## SQL Helper Functions

### `deduct_from_single_entity(entities, entity_id, amount, allow_negative, min_balance)`
Deducts from a specific entity's balance in JSONB.

### `deduct_from_all_entities(entities, amount, allow_negative, min_balance)`
Iteratively deducts from all entities in JSONB.

### `deduct_allowance_from_entitlements(sorted_entitlements, amount, target_entity_id)`
Main function that orchestrates the entire deduction process.

## Example Usage

```typescript
await runDeductionTx({
  ctx,
  customerId: "cus_123",
  entityId: "org_456",  // Optional
  deductions: [
    { feature: feature1, deduction: 100 },
    { feature: feature2, deduction: 50 }
  ],
  overageBehaviour: "reject",  // or "cap"
  addToAdjustment: false,      // true for billing adjustments
  eventInfo: { ... }           // Optional event tracking
});
```

## Performance Considerations

- PostgreSQL function handles all deduction logic → minimal round trips
- Transaction ensures atomic updates
- Sorting happens in TypeScript (typically <10 entitlements)
- Connection pooling prevents exhaustion under high concurrency

