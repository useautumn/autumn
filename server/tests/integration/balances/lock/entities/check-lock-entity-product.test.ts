import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeCustomerProd = () =>
	products.base({
		id: "customer-prod",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

const makeEntityProd = () =>
	products.base({
		id: "entity-prod",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

test.concurrent(
	`${chalk.yellowBright("lock-entity-prod EQ-1: [mixed] entity lock=30 on ent-1 confirm=10 — partial refund")}`,
	async () => {
		const customerProd = makeCustomerProd();
		const entityProd = makeEntityProd();
		const customerId = "lock-eq-1";
		const lockKey = `${customerId}-lock`;

		const { autumnV2_1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
			],
		});

		await deleteLock({ ctx, lockId: lockKey });

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

		await timeout(3000);

		if (!isBalanceWorkerRoute()) {
			const customer =
				await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining: 190,
			});
		}

		await expectCustomerEventsCorrect({
			customerId,
			events: [{ value: -20 }, { value: 30 }],
		});

		if (!isBalanceWorkerRoute()) {
			const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(
				customerId,
				{ skip_cache: "true" },
			);
			expectBalanceCorrect({
				customer: customerDb,
				featureId: TestFeature.Messages,
				remaining: 190,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-entity-prod EQ-2: [mixed] entity lock=30 on ent-1 confirm=80 — spills into customer bucket, ent-2 untouched")}`,
	async () => {
		const customerProd = makeCustomerProd();
		const entityProd = makeEntityProd();
		const customerId = "lock-eq-2";
		const lockKey = `${customerId}-lock`;

		const { autumnV2_1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
				s.warmEntityCaches(),
			],
		});

		await deleteLock({ ctx, lockId: lockKey });

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

		await timeout(3000);

		if (isBalanceWorkerRoute()) return;

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 120,
		});

		const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: customerDb,
			featureId: TestFeature.Messages,
			remaining: 120,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("lock-entity-prod EQ-7: [mixed] two concurrent entity locks (ent-1 + ent-2) — independent receipts, both confirmed")}`,
	async () => {
		const customerProd = makeCustomerProd();
		const entityProd = makeEntityProd();
		const customerId = "lock-eq-7";
		const lockKeyA = `${customerId}-lock-a`;
		const lockKeyB = `${customerId}-lock-b`;

		const { autumnV2_1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
			],
		});

		await Promise.all([
			deleteLock({ ctx, lockId: lockKeyA }),
			deleteLock({ ctx, lockId: lockKeyB }),
		]);

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

		if (isBalanceWorkerRoute()) return;

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 160,
		});

		const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: customerDb,
			featureId: TestFeature.Messages,
			remaining: 160,
		});
	},
);
