import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { warmEntityCaches } from "@tests/integration/balances/utils/warmEntityCaches";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeProd = () =>
	products.base({
		id: "free",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyMessages({
				includedUsage: 50,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

test.concurrent(`${chalk.yellowBright("lock-entity EP-2: entity-level lock=30 confirm=10 — partial refund to ent-1, ent-2 untouched")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-2";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });
	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 10,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 190,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 140,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 150,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -20 }, { value: 30 }],
	});
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-3: entity-level lock=30 confirm=80 — spills into customer bucket, ent-2 untouched")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-3";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });
	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: lockKey },
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
		remaining: 120,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 70,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 120,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 50 }, { value: 30 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 120,
	});
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-4: entity-level lock=40 release — ent-1 fully restored, ent-2 untouched")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-4";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 40,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "release",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 150,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 150,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -40 }, { value: 40 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 200,
	});
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-5: entity-level across lock=12 confirm=8 — LIFO unwind across entity buckets")}`, async () => {
	const customerId = "lock-entity-5";
	const lockKey = `${customerId}-lock`;

	const freeProd = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({
				includedUsage: 10,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });
	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 14,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 12,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 2,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -6 }, { value: 14 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 12,
	});
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-6: customer-level lock=120 confirm=160 — extra deduction reaches ent-2")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-6";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });
	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 120,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 160,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 40,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);

	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 0,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 40,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 40 }, { value: 120 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 40,
	});
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-7: ent-1 lock held while customer-level track fires — both resolve independently")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-7";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });
	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 160,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 110,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 140,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 10 }, { value: 30 }],
	});

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });
});

test.concurrent(`${chalk.yellowBright("lock-entity EP-8: two concurrent entity locks (ent-1 + ent-2) — independent receipts, both confirmed")}`, async () => {
	const freeProd = makeProd();
	const customerId = "lock-entity-8";
	const lockKeyA = `${customerId}-lock-a`;
	const lockKeyB = `${customerId}-lock-b`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await Promise.all([
		deleteLock({ ctx, lockId: lockKeyA }),
		deleteLock({ ctx, lockId: lockKeyB }),
	]);

	await warmEntityCaches({ autumn: autumnV2_1, customerId, entities });

	await Promise.all([
		autumnV2_1.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 30,
			lock: { enabled: true, lock_id: lockKeyA },
		}),
		autumnV2_1.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 20,
			lock: { enabled: true, lock_id: lockKeyB },
		}),
	]);

	await Promise.all([
		autumnV2_1.balances.finalize({
			lock_id: lockKeyA,
			action: "confirm",
			override_value: 15,
		}),
		autumnV2_1.balances.finalize({
			lock_id: lockKeyB,
			action: "confirm",
			override_value: 25,
		}),
	]);

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 135,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 160,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 125,
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});

	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 160,
	});
});
