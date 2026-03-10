import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Credit system schema:
//   Action1 → Credits  (credit_cost=0.2)
//   Action3 → Credits2 (credit_cost=1.4)
// ─────────────────────────────────────────────────────────────────────────────

const makeAction1CreditsProd = () =>
  products.base({
    id: "free",
    items: [
      items.free({ featureId: TestFeature.Action1, includedUsage: 100 }),
      items.monthlyCredits({ includedUsage: 200 }),
    ],
  });

const makeAction3Credits2Prod = () =>
  products.base({
    id: "free",
    items: [
      items.free({ featureId: TestFeature.Action3, includedUsage: 60 }),
      items.free({ featureId: TestFeature.Credits2, includedUsage: 100 }),
    ],
  });

// ─────────────────────────────────────────────────────────────────────────────
// CS-1: confirm override_value=0 — full refund via confirm (not release)
// action1=100. lock=8 → action1=92. confirm override_value=0 → delta=-8,
// full unwind of receipt. action1=100, credits=200.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-1: lock=8 confirm override_value=0 — full refund via confirm, not release")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-1";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 0,
  });

  // delta = 0 - 8 = -8 → full unwind, action1 fully restored
  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 100,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 200,
  });

  // 2 events: finalize (-8), check (8)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -8 }, { value: 8 }],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-2: cross-boundary lock=8, confirm=12 — extra deduction into credits
// track(95): action1=5. Lock deducts 5 from action1 + 3 overflow (0.6 credits).
// confirm=12: finalValue=12, delta=+4 → deduct 4 more from credits (0.8 credits).
// action1=0, credits = 200 - 0.6 - 0.8 = 198.6.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-2: cross-boundary lock=8 confirm=12 — extra deduction into credits")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-2";

  const {
    autumnV2_1,
    ctx,
    ctx: { features },
  } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 12,
  });

  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const lockCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 3, // overflow during lock: 8 - 5 remaining = 3
  });
  const extraCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 4, // confirm delta: 12 - 8 = 4 more units
  });
  const expectedCredits = new Decimal(200)
    .sub(lockCreditCost)
    .sub(extraCreditCost)
    .toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  // delta = 12 - 8 = 4. Events: finalize (+4), check (8), prior track (95)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 4 }, { value: 8 }, { value: 95 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-3: cross-boundary lock=8, confirm=3 — partial unwind
// track(95): action1=5. Lock deducts 5 from action1 + 3 overflow (0.6 credits).
// confirm=3: delta=-5 → unwind LIFO: restore 3 from credits (→200), restore 2 from action1 (→2).
// action1=2, credits=200.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-3: cross-boundary lock=8 confirm=3 — unwind restores credits then action1")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-3";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 3,
  });

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 2,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 200,
  });

  // delta = 3 - 8 = -5. Events: finalize (-5), check (8), prior track (95)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -5 }, { value: 8 }, { value: 95 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action1,
    remaining: 2,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: 200,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-4: lock within action1, confirm blows past action1 entirely into credits
// action1=100. lock=10 → action1=90. confirm override_value=115: delta=+105.
// Deduct 105 more: exhaust action1 (90 → 0), overflow 15 → 15×0.2=3 credits.
// action1=0, credits=200-3=197.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-4: lock within action1, confirm=115 blows past action1 into credits")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-4";

  const {
    autumnV2_1,
    ctx,
    ctx: { features },
  } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 10,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 115,
  });

  // Lock deducted 10 from action1 (→90). Confirm delta=+105:
  // exhaust remaining 90 from action1 (→0), then 15 overflow → 15×0.2=3 credits.
  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const overflowCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 15,
  });
  const expectedCredits = new Decimal(200).sub(overflowCreditCost).toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  // 2 events: finalize (+105), check (10)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 105 }, { value: 10 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-5: decimal lock=27.89, confirm=12.45 — partial unwind within action1
// action1=100. lock=27.89 all from action1. confirm=12.45 → unwind 15.44 from action1.
// action1=100-12.45=87.55, credits=200.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-5: decimal lock=27.89 confirm=12.45 — partial unwind within action1")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-5";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 27.89,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 12.45,
  });

  const expectedAction1 = new Decimal(100).sub(12.45).toNumber();
  const delta = new Decimal(12.45).sub(27.89).toNumber(); // -15.44

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: expectedAction1,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 200,
  });

  // 2 events: finalize (-15.44), check (27.89)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: delta }, { value: 27.89 }],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-6: credits2 cross-boundary lock=10, confirm=3 — partial unwind
// action3(60) + credits2(100). track(55): action3=5.
// Lock=10: deducts 5 from action3 (→0), overflow=5 → 5×1.4=7 credits from credits2 (→93).
// confirm=3: delta=-7 → unwind LIFO: restore 5 units from credits2 (7 credits →100), restore 2 from action3 (→2).
// action3=2, credits2=100.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-6: action3→credits2 cross-boundary lock=10 confirm=3 — partial unwind restores credits2 then action3")}`, async () => {
  const freeProd = makeAction3Credits2Prod();
  const customerId = "lock-credit-6";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    value: 55,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    required_balance: 10,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 3,
  });

  const delta = new Decimal(3).sub(10).toNumber(); // -7

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action3,
    remaining: 2,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits2,
    remaining: 100,
  });

  // delta=-7. Events: finalize (-7), check (10), prior track (55)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: delta }, { value: 10 }, { value: 55 }],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-7: credits2 cross-boundary release — credits2 fully restored
// action3(60) + credits2(100). track(55): action3=5.
// Lock=10: deducts 5 from action3 (→0), overflow=5 → 7 credits from credits2 (→93).
// release: delta=-10 → full unwind. action3=5, credits2=100.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-7: action3→credits2 cross-boundary release — credits2 fully restored")}`, async () => {
  const freeProd = makeAction3Credits2Prod();
  const customerId = "lock-credit-7";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    value: 55,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    required_balance: 10,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "release",
  });

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action3,
    remaining: 5,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits2,
    remaining: 100,
  });

  // release: delta=0-10=-10. Events: finalize (-10), check (10), prior track (55)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -10 }, { value: 10 }, { value: 55 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action3,
    remaining: 5,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits2,
    remaining: 100,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-8: cross-boundary release — credits fully restored
// action1(100) + credits(200). track(95): action1=5.
// Lock=8: deducts 5 from action1 + 3 overflow (0.6 credits). Release → full unwind.
// action1=5, credits=200.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-8: cross-boundary release — credits fully restored")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-8";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "release",
  });

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 5,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 200,
  });

  // release: delta=0-8=-8. Events: finalize (-8), check (8), prior track (95)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -8 }, { value: 8 }, { value: 95 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action1,
    remaining: 5,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: 200,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-9: override_value > lock, lock already crossed into credits, confirm goes deeper
// action1(100) + credits(200). track(95): action1=5.
// Lock=8: deducts 5 from action1 (→0) + 3 overflow → 3×0.2=0.6 credits (→199.4).
// confirm override_value=20: delta=+12 → deduct 12 more units, all from credits (12×0.2=2.4).
// action1=0, credits=199.4-2.4=197.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-9: cross-boundary lock=8 confirm=20 — override_value > lock, extra credit deduction")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-9";

  const {
    autumnV2_1,
    ctx,
    ctx: { features },
  } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 20,
  });

  // Lock deducted: 5 from action1 + 3 overflow (0.6 credits).
  // Confirm delta = 20 - 8 = 12 more units, action1 is already 0, all go to credits: 12×0.2=2.4.
  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const lockOverflowCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 3,
  });
  const confirmExtraCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 12,
  });
  const expectedCredits = new Decimal(200)
    .sub(lockOverflowCost)
    .sub(confirmExtraCost)
    .toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  // delta = 20 - 8 = 12. Events: finalize (+12), check (8), prior track (95)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 12 }, { value: 8 }, { value: 95 }],
  });

  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-10: confirm with no override_value — early exit, receipt deleted, balance unchanged
// action1(100) + credits(200). track(95): action1=5.
// Lock=8: deducts 5 from action1 (→0) + 3 overflow → 0.6 credits (→199.4).
// confirm with no override_value → finalValue defaults to lockValue (8) → early exit.
// Receipt is deleted. action1=0, credits=199.4. No finalize event emitted.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-10: confirm no override_value — early exit, receipt deleted, balance + events unchanged")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-10";

  const {
    autumnV2_1,
    ctx,
    ctx: { features },
  } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, key: customerId },
  });

  // No override_value → finalValue === lockValue (8) → early exit
  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
  });

  // Balances unchanged from what the lock left
  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const lockOverflowCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 3, // overflow during lock: 8 - 5 remaining = 3
  });
  const expectedCredits = new Decimal(200).sub(lockOverflowCost).toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Action1,
    remaining: 0,
  });
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  // Early exit → no finalize event. Only check (8) + prior track (95).
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 8 }, { value: 95 }],
  });

  // Receipt must be deleted after finalize
  await expectLockReceiptDeleted({ ctx, lockKey: customerId });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-11: direct credits lock=30, confirm=20 — partial refund
// Customer has only a Credits bucket (200), no Action1.
// check(feature_id=Credits, required_balance=30) → deducts 30 credits directly (1:1).
// confirm(override_value=20) → delta=-10 → unwind 10 → credits=180.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-11: direct credits lock=30 confirm=20 — partial refund, credits=180")}`, async () => {
  // Product with only a Credits bucket — no Action1 item. Credits used as the
  // feature directly (1:1 deduction, no credit-cost conversion).
  const freeProd = products.base({
    id: "free",
    items: [items.monthlyCredits({ includedUsage: 200 })],
  });
  const customerId = "lock-credit-11";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Credits,
    required_balance: 30,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 20,
  });

  // delta = 20 - 30 = -10 → 10 credits refunded
  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 180,
  });

  // Events: finalize (-10), check (30)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -10 }, { value: 30 }],
  });

  // DB balance
  await timeout(3000);
  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: 180,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CS-12: direct credits lock=30, confirm=45 — extra deduction
// Customer has only a Credits bucket (200), no Action1.
// check(feature_id=Credits, required_balance=30) → credits=170.
// confirm(override_value=45) → delta=+15 → deduct 15 more → credits=155.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-credit CS-12: direct credits lock=30 confirm=45 — extra deduction, credits=155")}`, async () => {
  const freeProd = products.base({
    id: "free",
    items: [items.monthlyCredits({ includedUsage: 200 })],
  });
  const customerId = "lock-credit-12";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockKey: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Credits,
    required_balance: 30,
    lock: { enabled: true, key: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_key: customerId,
    action: "confirm",
    override_value: 45,
  });

  // delta = 45 - 30 = +15 → 15 more credits deducted → 200 - 45 = 155
  const expectedCredits = new Decimal(200).sub(45).toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  // Events: finalize (+15), check (30)
  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 15 }, { value: 30 }],
  });

  // DB balance
  await timeout(3000);
  const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
    skip_cache: "true",
  });
  expectBalanceCorrect({
    customer: customerDb,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });
});
