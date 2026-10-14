import { test } from "bun:test";
import { type ApiCustomerV5, RolloverExpiryDurationType } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeFreeProd = () =>
	products.base({
		id: "free",
		items: [
			items.monthlyMessagesWithRollover({
				includedUsage: 100,
				rolloverConfig: {
					max: 200,
					length: 1,
					duration: RolloverExpiryDurationType.Month,
				},
			}),
		],
	});

test.concurrent(`${chalk.yellowBright("lock-rollover RO-1: lock across two rollovers + main, confirm with refund crossing main→rollover[1] boundary")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-ro-1";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.resetFeature({ featureId: TestFeature.Messages }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	const afterSetup = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterSetup,
		featureId: TestFeature.Messages,
		remaining: 300,
		rollovers: [{ balance: 100 }, { balance: 100 }],
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 250,
		lock: { enabled: true, lock_id: lockKey },
	});

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 50,
		rollovers: [{ balance: 0 }, { balance: 0 }],
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 80,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 220,
		rollovers: [{ balance: 20 }, { balance: 100 }],
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -170 }, { value: 250 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 220,
		rollovers: [{ balance: 20 }, { balance: 100 }],
	});
});

test.concurrent(`${chalk.yellowBright("lock-rollover RO-3: lock within rollover, confirm with extra deduction past rollover→main boundary")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-ro-3";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	const afterSetup = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterSetup,
		featureId: TestFeature.Messages,
		remaining: 200,
		rollovers: [{ balance: 100 }],
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: lockKey },
	});

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 170,
		rollovers: [{ balance: 70 }],
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 150,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 50,
		rollovers: [{ balance: 0 }],
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 120 }, { value: 30 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 50,
		rollovers: [{ balance: 0 }],
	});
});
