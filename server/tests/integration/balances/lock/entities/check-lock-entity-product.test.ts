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

	// delta = 10 - 30 = -20 → restore 20 to ent-1
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

	// Events newest-first: finalize(-20), check(30)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -20 }, { value: 30 }],
	});

	await timeout(3000);

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

	// delta = 80 - 30 = +50 → exhaust ent-1 own (20→0), spill 30 into customer (100→70)
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

	// Events newest-first: finalize(+50), check(30)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 50 }, { value: 30 }],
	});

	await timeout(3000);

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
// EQ-3 [Setup A]: customer-level lock=120, confirm=60 — LIFO unwind across entity buckets
// Check: customer 100→0, ent-1 50→30. Receipt: [customer:100, ent-1:20]. total=80.
// Confirm delta=60-120=-60 → LIFO: restore 20 to ent-1 (→50), restore 40 to customer (→40).
// Final: customer=40, ent-1=50, ent-2=50. total=140, ent-1 view=90, ent-2 view=90.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-3: [mixed] customer lock=120 confirm=60 — LIFO unwind across entity buckets")}`, async () => {
	const customerProd = makeCustomerProd();
	const entityProd = makeEntityProd();
	const customerId = "lock-eq-3";
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

	// No entity_id → customer-level lock, draws customer then ent-1
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 120,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 60,
	});

	// delta = 60 - 120 = -60 → LIFO: restore 20 to ent-1 (50→50), restore 40 to customer (0→40)
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 140,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	// Events newest-first: finalize(-60), check(120)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -60 }, { value: 120 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 140,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EQ-4 [Setup A]: customer-level lock=120, confirm=160 — extra deduction reaches ent-2
// Check: customer 100→0, ent-1 50→30. Receipt: [customer:100, ent-1:20]. total=80.
// Confirm delta=160-120=+40 → deduct 30 from ent-1 (→0), 10 from ent-2 (→40).
// Final: customer=0, ent-1=0, ent-2=40. total=40, ent-1 view=0, ent-2 view=40.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-4: [mixed] customer lock=120 confirm=160 — extra deduction reaches ent-2")}`, async () => {
	const customerProd = makeCustomerProd();
	const entityProd = makeEntityProd();
	const customerId = "lock-eq-4";
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
		feature_id: TestFeature.Messages,
		required_balance: 120,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 160,
	});

	// delta = 160 - 120 = +40 → exhaust ent-1 remaining 30 (→0), then 10 from ent-2 (→40)
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

	// Events newest-first: finalize(+40), check(120)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 40 }, { value: 120 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 40,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EQ-5 [Setup B — entity-only]: customer-level lock=80 crosses ent-1→ent-2 boundary,
// confirm=30 — LIFO unwind back across the boundary.
// No customer product; only entity products.
//
// Initial: ent-1=50, ent-2=50, customer total=100.
// Check (no entity_id): deduction order ent-1→ent-2.
//   ent-1: 50→0, ent-2: 50→20. Receipt: [ent-1:50, ent-2:30]. total=20.
// Confirm delta=30-80=-50 → LIFO: restore 30 to ent-2 (→50), restore 20 to ent-1 (→20).
// Final: ent-1=20, ent-2=50. total=70, ent-1 view=20, ent-2 view=50.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-5: [entity-only] customer lock=80 crosses ent-1→ent-2 boundary, confirm=30 — LIFO unwind crosses back")}`, async () => {
	const entityProd = makeEntityProd();
	const customerId = "lock-eq-5";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// No customer-level product — entities only
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	// Customer-level lock, no customer product — draws ent-1 then ent-2
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 80,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 30,
	});

	// delta = 30 - 80 = -50 → LIFO: restore 30 to ent-2 (20→50), restore 20 to ent-1 (0→20)
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 70,
	});

	const ent1 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[0].id,
	);
	expectBalanceCorrect({
		customer: ent1,
		featureId: TestFeature.Messages,
		remaining: 20,
	});

	const ent2 = await autumnV2_1.entities.get<ApiCustomerV5>(
		customerId,
		entities[1].id,
	);
	expectBalanceCorrect({
		customer: ent2,
		featureId: TestFeature.Messages,
		remaining: 50,
	});

	// Events newest-first: finalize(-50), check(80)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -50 }, { value: 80 }],
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

// ─────────────────────────────────────────────────────────────────────────────
// EQ-6 [Setup B — entity-only]: customer-level lock=80, confirm=100 — extra deduction
// deeper into ent-2 after the boundary was already crossed during check.
//
// Check: ent-1 50→0, ent-2 50→20. Receipt: [ent-1:50, ent-2:30]. total=20.
// Confirm delta=100-80=+20 → deduct 20 more from ent-2 (20→0).
// Final: ent-1=0, ent-2=0. total=0.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-entity-prod EQ-6: [entity-only] customer lock=80, confirm=100 — extra deduction goes deeper into ent-2")}`, async () => {
	const entityProd = makeEntityProd();
	const customerId = "lock-eq-6";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 80,
		lock: { enabled: true, lock_id: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
		override_value: 100,
	});

	// delta = 100 - 80 = +20 → deduct 20 from ent-2 (20→0)
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
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
		remaining: 0,
	});

	// Events newest-first: finalize(+20), check(80)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 20 }, { value: 80 }],
	});

	await timeout(3000);

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 0,
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

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 160,
	});
});
