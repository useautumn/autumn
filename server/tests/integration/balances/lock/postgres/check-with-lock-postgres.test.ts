import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	return products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});
};

test.concurrent(`${chalk.yellowBright("postgres PG-1: skip_cache check + normal confirm — partial refund, remaining=10")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-pg-1";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
		skip_cache: true,
	});

	await autumnV2_1.balances.finalize(
		{
			lock_id: customerId,
			action: "confirm",
			override_value: 5,
		},
		{ skipCache: true },
	);

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -3 }, { value: 8 }],
	});

	await timeout(3000);
	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 10,
	});
});

test.concurrent(`${chalk.yellowBright("postgres PG-2: normal check + skip_cache finalize — extra deduction, remaining=4")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-pg-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
		skip_cache: true,
	});

	await autumnV2_1.balances.finalize(
		{
			lock_id: customerId,
			action: "confirm",
			override_value: 11,
		},
		{ skipCache: true },
	);

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 4,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 3 }, { value: 8 }],
	});

	await timeout(3000);
	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 4,
	});
});

test.concurrent(`${chalk.yellowBright("postgres PG-3: skip_cache check + skip_cache finalize — cross-bucket refund, remaining=13")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-pg-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
		skip_cache: true,
	});

	await autumnV2_1.balances.finalize(
		{
			lock_id: customerId,
			action: "confirm",
			override_value: 3,
		},
		{ skipCache: true },
	);

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 12,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -5 }, { value: 8 }],
	});

	await timeout(3000);
	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 12,
	});
});
