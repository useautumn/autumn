# Future Test Plans & Implementation Prompts

This file contains:
1. **Implementation Prompt Template** — For writing tests from a completed plan
2. **Planning Prompt Template** — For planning tests for folders that need it
3. **Folders Needing Planning** — List of folders with key questions

---

## Implementation Prompt Template

Use this prompt to start writing tests from a **completed test plan** (e.g., `new-plan.md`, `immediate-switch.md`):

```
I need to implement tests for the Attach V2 `{FOLDER_NAME}` folder.

## Required Reading (Read ALL of these first)

### 1. Test Writing Skill (CRITICAL - read the entire folder)
Read all files in `/.claude/skills/write-test/`:
- `SKILL.md` — Main skill file
- `references/SCENARIO.md` — How to use initScenario
- `references/FIXTURES.md` — Product fixtures (products.pro, items.monthlyCredits, etc.)
- `references/EXPECTATIONS.md` — Expectation helpers
- `references/GOTCHAS.md` — Common pitfalls
- `references/ENTITIES.md` — Entity-level testing
- `references/STRIPE-BEHAVIORS.md` — Stripe-specific behaviors
- `references/WEBHOOKS.md` — Webhook testing
- `references/TRACK-CHECK.md` — Track/check endpoint testing

### 2. Attach V2 Test Guide
Read `/server/tests/integration/billing/attach/attachTests.md` for:
- 12 key gotchas specific to attach tests
- AutumnInt generic types
- Folder structure

### 3. The Test Plan for This Folder
Read `/server/tests/integration/billing/attach/{FOLDER_NAME}.md` for:
- File structure and test cases to implement
- Setup patterns and key assertions

### 4. Reference: New Testing Style
Look at `/server/tests/integration/billing/update-subscription/` for the NEW testing style:
- How tests are organized into folders/files
- How `initScenario` is used
- How expectations are structured

Specifically look at a few example files:
- `cancel/end-of-cycle/cancel-end-of-cycle.test.ts`
- `custom-plan/update-paid-basic.test.ts`
- `errors/update-errors-basic.test.ts`

## Your Task

1. **Create the folder structure** at `/server/tests/integration/billing/attach/{FOLDER_NAME}/`

2. **Implement test files** one at a time, following:
   - The test cases specified in the plan
   - The `initScenario` pattern from the write-test skill
   - The NEW testing style from update-subscription/

3. **For each test file:**
   - Use `initScenario` for setup (NOT the old `beforeAll` pattern)
   - Use product fixtures from `@tests/utils/fixtures/products.ts`
   - Use expectation helpers from `@tests/utils/expectUtils/`
   - Follow the 12 gotchas in `attachTests.md`

4. **Run tests after each file** to verify they pass:
   ```bash
   bun test server/tests/integration/billing/attach/{FOLDER_NAME}/{FILE_NAME}.test.ts
   ```

## Important Notes

- Use `initScenario` — this is the NEW pattern, not `beforeAll` + manual setup
- Always use `product.id`, never string literals
- Payment method required for paid features: `s.customer({ paymentMethod: "success" })`
- Prepaid requires `options` on attach
- Use `expectSubToBeCorrect` when billing is involved
- Server logs are NOT visible in test output — ask user to paste logs if needed
```

---

## Example: Implementing `new-plan/` Tests

```
I need to implement tests for the Attach V2 `new-plan` folder.

## Required Reading (Read ALL of these first)

### 1. Test Writing Skill (CRITICAL - read the entire folder)
Read all files in `/.claude/skills/write-test/`:
- `SKILL.md` — Main skill file
- `references/SCENARIO.md` — How to use initScenario
- `references/FIXTURES.md` — Product fixtures (products.pro, items.monthlyCredits, etc.)
- `references/EXPECTATIONS.md` — Expectation helpers
- `references/GOTCHAS.md` — Common pitfalls
- `references/ENTITIES.md` — Entity-level testing
- `references/STRIPE-BEHAVIORS.md` — Stripe-specific behaviors
- `references/WEBHOOKS.md` — Webhook testing
- `references/TRACK-CHECK.md` — Track/check endpoint testing

### 2. Attach V2 Test Guide
Read `/server/tests/integration/billing/attach/attachTests.md` for:
- 12 key gotchas specific to attach tests
- AutumnInt generic types
- Folder structure

### 3. The Test Plan for This Folder
Read `/server/tests/integration/billing/attach/new-plan.md` for:
- File structure and test cases to implement
- Setup patterns and key assertions

### 4. Reference: New Testing Style
Look at `/server/tests/integration/billing/update-subscription/` for the NEW testing style:
- How tests are organized into folders/files
- How `initScenario` is used
- How expectations are structured

Specifically look at a few example files:
- `cancel/end-of-cycle/cancel-end-of-cycle.test.ts`
- `custom-plan/update-paid-basic.test.ts`
- `errors/update-errors-basic.test.ts`

## Your Task

1. **Create the folder structure** at `/server/tests/integration/billing/attach/new-plan/`

2. **Implement test files** one at a time, following:
   - The test cases specified in the plan
   - The `initScenario` pattern from the write-test skill
   - The NEW testing style from update-subscription/

3. **For each test file:**
   - Use `initScenario` for setup (NOT the old `beforeAll` pattern)
   - Use product fixtures from `@tests/utils/fixtures/products.ts`
   - Use expectation helpers from `@tests/utils/expectUtils/`
   - Follow the 12 gotchas in `attachTests.md`

4. **Run tests after each file** to verify they pass:
   ```bash
   bun test server/tests/integration/billing/attach/new-plan/{FILE_NAME}.test.ts
   ```

## Important Notes

- Use `initScenario` — this is the NEW pattern, not `beforeAll` + manual setup
- Always use `product.id`, never string literals
- Payment method required for paid features: `s.customer({ paymentMethod: "success" })`
- Prepaid requires `options` on attach
- Use `expectSubToBeCorrect` when billing is involved
- Server logs are NOT visible in test output — ask user to paste logs if needed
```

---

# Future Test Plans (To Be Planned)

These folders need detailed test planning before implementation. Use the prompt template at the bottom to start a planning session for each.

---

## Folders Needing Planning

### 1. `carry-existing-usages/`
**What it covers:** When upgrading/downgrading, how existing usage (consumable, prepaid, allocated) carries over or resets.

**Key questions to answer:**
- Does consumable usage reset on upgrade? (Current understanding: YES, resets, overage NOT charged)
- Does allocated usage carry over? (Current understanding: YES)
- Does prepaid balance carry over? How is it converted between billing units?
- What happens to usage when scheduled switch activates at end of cycle?

**Related code:** Look for `carryOverUsages`, `existingUsages`, `rollovers` in the codebase.

---

### 2. `trials/`
**What it covers:** Free trial logic during attach operations.

**Key questions to answer:**
- Trial with card required vs no card required
- Trial to paid conversion (natural end vs early removal)
- Upgrading/downgrading while in trial
- Trial on entities
- Preventing duplicate trials (fingerprint check)
- `free_trial` param override (from ENG-1013 follow-up)

**Note:** We have a draft in `trials.md` but need to verify against actual implementation.

---

### 3. `invoice/`
**What it covers:** The `invoice: true` mode where product is NOT granted until invoice is paid.

**Key questions to answer:**
- Product not attached until invoice status = "paid"
- Invoice mode with upgrades vs new subscriptions
- Invoice mode with prepaid/one-off
- `enable_product_immediately` and `finalize_invoice` params (from ENG-1013)

**Reference:** See `update-subscription/invoice/` for existing patterns.

---

### 4. `new-billing-subscription/`
**What it covers:** The `new_billing_subscription` param that forces creation of a new Stripe subscription instead of merging.

**Key questions to answer:**
- When does a new subscription get created vs merging into existing?
- Entity1 has pro, Entity2 attaches pro → same or different subscription?
- Add-on on separate subscription
- Billing anchor alignment across subscriptions

**From ENG-1013:**
> Use case: User has pro plan and attaches recurring add-on, or entity1 has pro and entity2 attaches pro

---

### 5. `billing-behavior/`
**What it covers:** The `billing_behavior` param that controls proration.

**Key questions to answer:**
- `"prorate_immediately"` — Default, charges prorated amount now
- `"none"` — No immediate proration, changes apply next cycle
- How does this interact with upgrades vs downgrades?
- How does this interact with prepaid quantities?

**Reference:** See PR #614 for `prorate_billing` in update subscription.

---

### 6. `plan-schedule/`
**What it covers:** The `plan_schedule` param that overrides default upgrade/downgrade timing.

**Key questions to answer:**
- Default: upgrades = immediate, downgrades = end_of_cycle
- Override: `"immediate"` forces immediate downgrade
- Override: `"end_of_cycle"` forces scheduled upgrade
- Should immediate downgrades allow proration refunds?

**From ENG-1013:**
> Override allows forcing immediate downgrades or scheduled upgrades

---

## Planning Session Prompt Template

Copy and customize this prompt to start a planning session for any of the above folders:

```
I need to plan tests for the Attach V2 `{FOLDER_NAME}` folder.

## Context

Read the following files first:
1. `/server/tests/integration/billing/attach/attachTests.md` — Main test guide with gotchas
2. `/server/tests/integration/billing/attach/new-plan.md` — Example of a completed test plan
3. Linear ticket ENG-1013: https://linear.app/useautumn/issue/ENG-1013/implement-v2-attach-endpoint

## What This Folder Covers

{BRIEF_DESCRIPTION_FROM_ABOVE}

## Key Questions to Answer

{COPY_KEY_QUESTIONS_FROM_ABOVE}

## Your Task

1. **Research the codebase** to understand how this feature currently works:
   - Search for relevant functions/types in `server/src/internal/billing/`
   - Look at existing tests in `server/tests/attach/` and `server/tests/merged/`
   - Check `server/tests/integration/billing/update-subscription/` for similar patterns

2. **Create a test plan** in `/server/tests/integration/billing/attach/{FOLDER_NAME}.md` with:
   - File structure (which test files to create)
   - Test cases in table format (Test Name | Scenario | Key Assertions)
   - Code snippets showing setup patterns
   - Any open questions or undefined behaviors

3. **Update `attachTests.md`** to add a link to the new test plan file

Do NOT write actual test code yet — this is a planning session only.
```

---

## Example: Starting a Planning Session for `carry-existing-usages/`

```
I need to plan tests for the Attach V2 `carry-existing-usages` folder.

## Context

Read the following files first:
1. `/server/tests/integration/billing/attach/attachTests.md` — Main test guide with gotchas
2. `/server/tests/integration/billing/attach/new-plan.md` — Example of a completed test plan
3. Linear ticket ENG-1013: https://linear.app/useautumn/issue/ENG-1013/implement-v2-attach-endpoint

## What This Folder Covers

When upgrading/downgrading, how existing usage (consumable, prepaid, allocated) carries over or resets.

## Key Questions to Answer

- Does consumable usage reset on upgrade? (Current understanding: YES, resets, overage NOT charged)
- Does allocated usage carry over? (Current understanding: YES)
- Does prepaid balance carry over? How is it converted between billing units?
- What happens to usage when scheduled switch activates at end of cycle?

## Your Task

1. **Research the codebase** to understand how this feature currently works:
   - Search for relevant functions/types in `server/src/internal/billing/`
   - Look at existing tests in `server/tests/attach/` and `server/tests/merged/`
   - Check `server/tests/integration/billing/update-subscription/` for similar patterns

2. **Create a test plan** in `/server/tests/integration/billing/attach/carry-existing-usages.md` with:
   - File structure (which test files to create)
   - Test cases in table format (Test Name | Scenario | Key Assertions)
   - Code snippets showing setup patterns
   - Any open questions or undefined behaviors

3. **Update `attachTests.md`** to add a link to the new test plan file

Do NOT write actual test code yet — this is a planning session only.
```
