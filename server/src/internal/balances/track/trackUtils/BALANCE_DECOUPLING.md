# Balance Decoupling System

## Balance Formulas

**API Response Fields (computed from DB):**
```
granted_balance = planFeature.granted_balance + sum(rollovers) + additional_granted_balance
purchased_balance = positive_conditional(balance) + prepaid_quantity
current_balance = granted_balance + purchased_balance - usage
```

Where `positive_conditional(balance)` means: if `balance` is negative (e.g., -10), contribute 10 to `purchased_balance`; if positive or zero, contribute 0.

**Important**: The DB field `balance` can go negative (for pay-per-use overages), but the API field `current_balance` is always >= 0.

## The Deduction Flow in `performDeduction.sql`

### Current Structure (Two-Pass Strategy)
**Pass 1**: Deduct all entitlements to 0 (regardless of `usage_allowed`)
**Pass 2**: Allow `usage_allowed=true` entitlements to go negative (respecting `min_balance`)

### New Step Order (Before Pass 1)

**Deduction Priority:**
1. **Rollovers first** (existing logic)
2. **Additional balance** (new logic - if `skip = false`)
3. **Main balance** (Pass 1 & Pass 2)

This ensures rollovers are consumed before the "paid but unused" credits in `additional_balance`.

### Control Flags

#### Flag 1: `skip`
Determines if we process additional_balance fields at all.

- **`skip = false`** (default):
  - **DO** process additional_balance fields
  - Used for: `handleUpdateBalances` AND `track()` with **positive** amounts
  - Allows users to consume their "paid but unused" credits

- **`skip = true`** (from `track()` with **negative** amount):
  - **SKIP** additional_balance fields entirely
  - Go straight to main balance
  - Example: Returning a seat via `track(-1)`
  - **Only used when tracking negative amounts** (returns/refunds)

#### Flag 2: `alter_granted`
Determines if we also adjust `additional_granted_balance`.

- **`alter_granted = true`** (from `handleUpdateBalances`):
  - Adjust both `additional_granted_balance` AND set target balance
  - Follows the target balance logic

- **`alter_granted = false`** (default - from `track()`):
  - Only allows deduction from `additional_balance` (if `skip = false`)
  - Never touches `additional_granted_balance`

---

## Complete Flow Examples

### Scenario 1: Normal Usage Tracking (`track(+10)`)
- Flags: `skip = false`, `alter_granted = false`
- Amount = +10 (positive)

Flow:
1. **Deduct from rollovers**: Deduct up to available rollover balance
   - Example: If rollovers = 3, deduct 3, remaining = 7
2. **Additional balance step**: Try to deduct from `additional_balance`
   - Example: If `additional_balance = 5`, deduct 5, remaining = 2
3. Pass 1: Deduct remaining 2 from main balance to 0
4. Pass 2: If `usage_allowed=true` and still remaining, deduct from balance below 0

**Result**: Rollovers → paid credits → main balance → negative (if allowed)

### Scenario 2: Returning Usage (`track(-5)`)
- Flags: `skip = true`, `alter_granted = false`
- Amount = -5 (negative)

Flow:
1. Rollovers: Skip (negative amount)
2. Additional balance step: **SKIP** entirely (`skip = true` because negative amount from track)
3. Pass 1: Add +5 to main balance (negative deduction = addition)
4. Done (balance increased)

**Why skip?** We don't want returns to go into `additional_balance` or rollovers - they should restore the main balance.

### Scenario 3: Admin Increase Balance (`update({ current_balance: 200 })`, current = 100)
- Flags: `skip = false`, `alter_granted = true`
- Difference = +100

Flow:
1. Calculate difference: +100
2. `additional_granted_balance += 100`
3. Set `balance = 200`
4. Done

### Scenario 4: Admin Decrease Balance (`update({ current_balance: 50 })`, current = 100)
- Flags: `skip = false`, `alter_granted = true`
- Difference = -50

Flow:
1. Calculate difference: -50
2. Check `additional_granted_balance >= 50`
   - ✅ If yes: `additional_granted_balance -= 50`
   - ❌ If no: **Error** and abort
3. Set `balance = 50`
4. Done

### Scenario 5: Usage with rollovers and "paid but unused" credits
- Initial state: `balance = 0`, `rollovers = 8`, `additional_balance = 10`
- `track(+25)` with flags: `skip = false`, `alter_granted = false`

Flow:
1. **Deduct from rollovers**: 8 deducted, remaining = 17
2. **Additional balance step**: 10 deducted from `additional_balance` → now 0, remaining = 7
3. Pass 1: Deduct 7 from main balance → `balance = -7` (DB field)
4. Done

**Result**: Consumed rollovers (8) → purchased credits (10) → went into overage (DB `balance = -7`)

**API Response**:
- `granted_balance = 0 + 0 + 0 = 0`
- `purchased_balance = 7 + 0 = 7` (from negative balance)
- `current_balance = 0 + 7 - 25 = -18` → displayed as `0` (API never shows negative)
- `usage = 25`

---

## Files to Modify

**Reference files** (old TypeScript, concept only):
- `deductFromAdditionalBalance.ts` - Shows single-field deduction
- `deductFromAdditionalGrantedBalance.ts` - Shows two-step deduction pattern

**Actual file to edit**:
- `performDeduction.sql` - PostgreSQL stored function
  - Currently handles: Rollovers → Pass 1 & Pass 2 on main balance
  - Need to add: additional_balance deduction logic **AFTER rollovers, BEFORE Pass 1**
  - Need to add: additional_granted_balance adjustment logic (for `alter_granted = true`)
  - Need to support: `skip` and `alter_granted` flags as parameters
  - Need to handle: entity-scoped versions of additional fields (in `entities` JSONB)

---

**Correct deduction order: Rollovers → Additional Balance → Main Balance (Pass 1 & 2)**
