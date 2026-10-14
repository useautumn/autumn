import { test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
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

test.concurrent(`${chalk.yellowBright("lock-pg-edge PG-EC-1: lock crosses monthly→lifetime, upgrade mid-flight, confirm with refund — postgres path, monthly(pro) untouched, lifetime refunded")}`, async () => {
	const addonProd = makeAddonProd();
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-pg-edge-1";
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
		skip_cache: true,
	});

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

	await autumnV2_1.balances.finalize(
		{
			lock_id: lockKey,
			action: "confirm",
			override_value: 57,
		},
		{
			skipCache: true,
		},
	);

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 173,
		breakdown: {
			[ResetInterval.Month]: { remaining: 80, usage: 0 },
			[ResetInterval.OneOff]: { remaining: 93, usage: 7 },
		},
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
		breakdown: {
			[ResetInterval.Month]: { remaining: 80, usage: 0 },
			[ResetInterval.OneOff]: { remaining: 93, usage: 7 },
		},
	});
});

test.concurrent(`${chalk.yellowBright("lock-pg-edge PG-EC-2: lock crosses monthly→lifetime, upgrade mid-flight, confirm with extra deduction — postgres path, monthly deducted")}`, async () => {
	const addonProd = makeAddonProd();
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-pg-edge-2";
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
		skip_cache: true,
	});

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

	await autumnV2_1.balances.finalize(
		{
			lock_id: lockKey,
			action: "confirm",
			override_value: 63,
		},
		{
			skipCache: true,
		},
	);

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
		breakdown: {
			[ResetInterval.Month]: { remaining: 77, usage: 3 },
			[ResetInterval.OneOff]: { remaining: 90, usage: 10 },
		},
	});
});

test.concurrent(`${chalk.yellowBright("lock-pg-edge PG-EC-3: lock on free, upgrade to pro, track, confirm refund — postgres path, skipped unwind redirects onto pro entitlement")}`, async () => {
	const freeProd = makeFreeProd();
	const proProd = makeProProd();
	const customerId = "lock-pg-edge-3";
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
		skip_cache: true,
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

	await timeout(4000);

	await autumnV2_1.balances.finalize(
		{
			lock_id: lockKey,
			action: "confirm",
			override_value: 30,
		},
		{
			skipCache: true,
		},
	);

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
