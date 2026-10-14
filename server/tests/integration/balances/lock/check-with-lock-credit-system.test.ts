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

test.concurrent(`${chalk.yellowBright("lock-credit CS-1: lock=8 confirm override_value=0 — full refund via confirm, not release")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-1";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 0,
  });

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

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -8 }, { value: 8 }],
  });
});

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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 12,
  });

  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const lockCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 3,
  });
  const extraCreditCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 4,
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

test.concurrent(`${chalk.yellowBright("lock-credit CS-3: cross-boundary lock=8 confirm=3 — unwind restores credits then action1")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-3";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 10,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 115,
  });

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

test.concurrent(`${chalk.yellowBright("lock-credit CS-5: decimal lock=27.89 confirm=12.45 — partial unwind within action1")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-5";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 27.89,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 12.45,
  });

  const expectedAction1 = new Decimal(100).sub(12.45).toNumber();
  const delta = new Decimal(12.45).sub(27.89).toNumber();

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

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: delta }, { value: 27.89 }],
  });
});

test.concurrent(`${chalk.yellowBright("lock-credit CS-6: action3→credits2 cross-boundary lock=10 confirm=3 — partial unwind restores credits2 then action3")}`, async () => {
  const freeProd = makeAction3Credits2Prod();
  const customerId = "lock-credit-6";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    value: 55,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    required_balance: 10,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 3,
  });

  const delta = new Decimal(3).sub(10).toNumber();

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

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: delta }, { value: 10 }, { value: 55 }],
  });
});

test.concurrent(`${chalk.yellowBright("lock-credit CS-7: action3→credits2 cross-boundary release — credits2 fully restored")}`, async () => {
  const freeProd = makeAction3Credits2Prod();
  const customerId = "lock-credit-7";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    value: 55,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action3,
    required_balance: 10,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
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

test.concurrent(`${chalk.yellowBright("lock-credit CS-8: cross-boundary release — credits fully restored")}`, async () => {
  const freeProd = makeAction1CreditsProd();
  const customerId = "lock-credit-8";

  const { autumnV2_1, ctx } = await initScenario({
    customerId,
    setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
    actions: [s.attach({ productId: freeProd.id })],
  });

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 20,
  });

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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.track({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    value: 95,
  });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Action1,
    required_balance: 8,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
  });

  const creditFeature = features.find((f) => f.id === TestFeature.Credits)!;
  const lockOverflowCost = getCreditCost({
    featureId: TestFeature.Action1,
    creditSystem: creditFeature,
    amount: 3,
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

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 8 }, { value: 95 }],
  });

  await expectLockReceiptDeleted({ ctx, lockId: customerId });
});

test.concurrent(`${chalk.yellowBright("lock-credit CS-11: direct credits lock=30 confirm=20 — partial refund, credits=180")}`, async () => {
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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Credits,
    required_balance: 30,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 20,
  });

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: 180,
  });

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: -10 }, { value: 30 }],
  });

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

  await deleteLock({ ctx, lockId: customerId });

  await autumnV2_1.check({
    customer_id: customerId,
    feature_id: TestFeature.Credits,
    required_balance: 30,
    lock: { enabled: true, lock_id: customerId },
  });

  await autumnV2_1.balances.finalize({
    lock_id: customerId,
    action: "confirm",
    override_value: 45,
  });

  const expectedCredits = new Decimal(200).sub(45).toNumber();

  const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
  expectBalanceCorrect({
    customer,
    featureId: TestFeature.Credits,
    remaining: expectedCredits,
  });

  await expectCustomerEventsCorrect({
    customerId,
    events: [{ value: 15 }, { value: 30 }],
  });

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
