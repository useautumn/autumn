import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// Setup A — Mixed (customer product + entity product attached to each entity)
//
//   customerProd: monthlyMessages(100) → customer-level bucket
//   entityProd:   monthlyMessages(50)  → per-entity bucket (one product, attached twice)
//
//   Initial state:
//     customer total = 200 (100 + 50 + 50)
//     ent-1 view    = 150 (50 own + 100 customer)
//     ent-2 view    = 150 (50 own + 100 customer)
//
//   Customer-level deduction order: customer bucket → ent-1 bucket → ent-2 bucket
//   Entity-level deduction order:   entity own bucket → customer bucket (never other entity)
//
// Setup B — Entity-only (no customer product; same entityProd attached to each entity)
//
//   entityProd: monthlyMessages(50)
//
//   Initial state:
//     customer total = 100 (50 + 50)
//     ent-1 view    = 50 (own only)
//     ent-2 view    = 50 (own only)
//
//   Customer-level deduction order: ent-1 bucket → ent-2 bucket (alphabetical; no customer bucket)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// EQ-1 [Setup A]: entity-level lock=30 on ent-1, confirm=10 (partial refund)
// Check: ent-1 own 50→20. Confirm delta=10-30=-20 → restore 20 to ent-1 (→40).
// Final: customer=100, ent-1=40, ent-2=50. total=190, ent-1 view=140, ent-2 view=150.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-1: [mixed] entity lock=30 on ent-1 confirm=10 — partial refund")}`, async () => {
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

	// delta = 10 - 30 = -20 → restore 20 to ent-1
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 190,
	});

	// Events newest-first: finalize(-20), check(30)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -20 }, { value: 30 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 190,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EQ-2 [Setup A]: entity-level lock=30 on ent-1, confirm=80 — spills into customer bucket
// Check: ent-1 own 50→20. Confirm delta=80-30=+50:
//   deduct 20 more from ent-1 (→0), then 30 from customer (→70).
// ent-2 NEVER touched (entity isolation).
// Final: customer=70, ent-1=0, ent-2=50. total=120, ent-1 view=70, ent-2 view=120.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-2: [mixed] entity lock=30 on ent-1 confirm=80 — spills into customer bucket, ent-2 untouched")}`, async () => {
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

	// Events newest-first: finalize(+50), check(30)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 50 }, { value: 30 }],
	});

	await timeout(3000);

	// delta = 80 - 30 = +50 → exhaust ent-1 own (20→0), spill 30 into customer (100→70)
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 120,
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

// ─────────────────────────────────────────────────────────────────────────────
// EQ-7 [Setup A]: two concurrent entity locks (ent-1 lock A, ent-2 lock B) — both confirmed.
// Lock A on ent-1: lock=30 → ent-1 own 50→20.
// Lock B on ent-2: lock=20 → ent-2 own 50→30.
// After both checks: total=150.
// Confirm A override=15: delta=15-30=-15 → restore 15 to ent-1 (→35). total→165.
// Confirm B override=25: delta=25-20=+5 → deduct 5 from ent-2 (→25). total→160.
// Final: customer=100, ent-1=35, ent-2=25. total=160, ent-1 view=135, ent-2 view=125.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-7: [mixed] two concurrent entity locks (ent-1 + ent-2) — independent receipts, both confirmed")}`, async () => {
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

	// Fire both locks concurrently
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

	// Confirm both concurrently with different override values
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

	// Confirm A delta=-15 → restore 15 to ent-1 (20→35)
	// Confirm B delta=+5  → deduct 5 from ent-2 (30→25)

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

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 160,
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 160,
	});
});
