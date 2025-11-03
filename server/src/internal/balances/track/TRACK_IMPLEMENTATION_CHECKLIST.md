# Track Implementation Checklist

## Validation

### 0. ✅ Validate Deduction
- If overage_allowed: False → Check feature.balance >= amount
- If overage_allowed: True → Check (usage_limit - usage) >= amount OR no usage_limit
- Two-pass atomic validation: Validate ALL features before ANY deductions (all-or-nothing)

## Deduction Cases

### 1. ✅ Main Balance Deduction
- With breakdowns: Deduct from breakdown balances, then breakdown overage
- Without breakdowns: Deduct from top-level balance, then top-level overage
- Respect overage_behavior ("cap" | "reject")

### 2. ✅ Rollover Balance Deduction
- Deduct from rollovers before main balance
- Update top-level balance and usage

### 3. ⬜ Credit System Deduction
- Deduct from credit features when target feature is insufficient

### 4. ⬜ Entity-Specific Deduction
- Handle entity-scoped deductions

