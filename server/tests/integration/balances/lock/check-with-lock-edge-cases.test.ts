import { test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeAddonProd = () =>
	products.base({
		id: "addon",
		isAddOn: true,
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

const makeFreeProd = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

const makeProProd = () =>
	products.base({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 80 })],
	});

test.concurrent(`${chalk.yellowBright("lock-edge EC-3: lock on free, upgrade to pro, track, confirm refund — skipped unwind redirects onto pro entitlement")}`, async () => {
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-edge-3";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd, proProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 40,
		lock: { enabled: true, lock_id: lockKey },
	});

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await autumnV2_1.attach({
		customer_id: customerId,
		product_id: proProd.id,
	});

	const afterUpgrade =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpgrade,
		featureId: TestFeature.Messages,
		remaining: 80,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 30,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 70,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -10 }, { value: 20 }, { value: 40 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 70,
	});
});

test.concurrent(`${chalk.yellowBright("lock-edge EC-1: lock crosses monthly→lifetime, upgrade mid-flight, confirm with refund — monthly(pro) untouched, lifetime refunded")}`, async () => {
	const addonProd = makeAddonProd();
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-edge-1";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [addonProd, freeProd, proProd] }),
		],
		actions: [
			s.attach({ productId: addonProd.id }),
			s.attach({ productId: freeProd.id }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 60,
		lock: { enabled: true, lock_id: lockKey },
	});

	await timeout(3000);

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	await autumnV2_1.attach({
		customer_id: customerId,
		product_id: proProd.id,
	});

	const afterUpgrade =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpgrade,
		featureId: TestFeature.Messages,
		remaining: 170,
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 57,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 173,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -3 }, { value: 60 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 173,
	});
});

test.concurrent(`${chalk.yellowBright("lock-edge EC-2: lock crosses monthly→lifetime, upgrade mid-flight, confirm with extra deduction — monthly deducted")}`, async () => {
	const addonProd = makeAddonProd();
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-edge-2";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [addonProd, freeProd, proProd] }),
		],
		actions: [
			s.attach({ productId: addonProd.id }),
			s.attach({ productId: freeProd.id }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 60,
		lock: { enabled: true, lock_id: lockKey },
	});

	await timeout(3000);

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	await autumnV2_1.attach({
		customer_id: customerId,
		product_id: proProd.id,
	});

	const afterUpgrade =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpgrade,
		featureId: TestFeature.Messages,
		remaining: 170,
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 63,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 167,
		breakdown: {
			[ResetInterval.Month]: { remaining: 77, usage: 3 },
			[ResetInterval.OneOff]: { remaining: 90, usage: 10 },
		},
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 3 }, { value: 60 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 167,
	});
});

test.concurrent(`${chalk.yellowBright("lock-edge EC-4: lock=0, confirm without override — zero-cost receipt finalizes cleanly")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-edge-4";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 0,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 50,
		breakdown: {
			[ResetInterval.Month]: { remaining: 50, usage: 0 },
		},
	});

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 50,
		breakdown: {
			[ResetInterval.Month]: { remaining: 50, usage: 0 },
		},
	});
});

test.concurrent(`${chalk.yellowBright("lock-edge EC-5: lock=0, confirm override=1.2 — additional amount is deducted")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-edge-5";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 0,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 1.2,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 48.8,
		breakdown: {
			[ResetInterval.Month]: { remaining: 48.8, usage: 1.2 },
		},
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 1.2 }, { value: 0 }],
	});

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 48.8,
		breakdown: {
			[ResetInterval.Month]: { remaining: 48.8, usage: 1.2 },
		},
	});
});
