import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
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

// ─────────────────────────────────────────────────────────────────────────────
// Setup: customer product with two message items:
//   - monthlyMessages(100)             → customer-level bucket
//   - monthlyMessages(50, entityFeatureId: Users) → per-entity bucket (50 each)
// Two entities: ent-1, ent-2
//
// Initial state:
//   customer total = 100 + 50 + 50 = 200
//   ent-1 view    = 50 (own) + 100 (customer) = 150
//   ent-2 view    = 50 (own) + 100 (customer) = 150
//
// Deduction order:
//   entity-level track (ent-1): ent-1 bucket → customer bucket (never ent-2)
//   customer-level track:       customer bucket → ent-1 bucket → ent-2 bucket (alphabetical)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// EP-2: entity-level lock on ent-1, confirm=10 (partial refund)
// Lock=30 deducts from ent-1 bucket (→20). Confirm=10 → delta=-20 →
// restore 20 to ent-1 (→40). ent-2 untouched.
// Final: customer=100, ent-1 own=40, ent-2 own=50.
// Customer total=190, ent-1 view=140, ent-2 view=150.
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	// Lock at entity level (ent-1)
	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, key: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
		action: "confirm",
		override_value: 10,
	});

	// delta = 10 - 30 = -20 → 20 restored to ent-1
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

	// Events scoped to ent-1: finalize(-20), check(30)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -20 }, { value: 30 }],
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-3: entity-level lock on ent-1, confirm=80 (confirm > lock, spills into customer bucket)
// Lock=30 deducts from ent-1 bucket (→20). Confirm=80 → delta=+50:
//   deduct 20 more from ent-1 bucket (→0), then 30 from customer bucket (→70).
// ent-2 is NEVER touched (entity isolation).
// Final: customer=70, ent-1 own=0, ent-2 own=50.
// Customer total=120, ent-1 view=70, ent-2 view=120.
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, key: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
		action: "confirm",
		override_value: 80,
	});

	// Lock deducted 30 from ent-1 (→20). Confirm delta=+50: exhaust ent-1 (20→0), then 30 from customer (→70).
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

	// Events: finalize(+50), check(30)
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

// ─────────────────────────────────────────────────────────────────────────────
// EP-4: entity-level lock on ent-1, release — full restore
// Lock=40 deducts 40 from ent-1 bucket (→10). Release → full unwind.
// Final: customer=100, ent-1 own=50, ent-2 own=50. Total=200.
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 40,
		lock: { enabled: true, key: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
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

	// release: delta=0-40=-40. Events: finalize(-40), check(40)
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

// ─────────────────────────────────────────────────────────────────────────────
// EP-5: customer-level lock=120, confirm=60 — unwinds across entity buckets LIFO
// Lock=120 (no entity_id): deducts 100 from customer bucket (→0), then 20 from ent-1 (→30).
// Receipt (in order): [customer: 100, ent-1: 20].
// Confirm=60 → delta=-60 → unwind LIFO: restore 20 to ent-1 (→50), restore 40 to customer (→40).
// Final: customer=40, ent-1 own=50, ent-2 own=50. Customer total=140, ent-1 view=90, ent-2 view=90.
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	// Customer-level lock (no entity_id)
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 14,
		lock: { enabled: true, key: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
		action: "confirm",
		override_value: 8,
	});

	// delta=-60: restore 20 to ent-1 (→50), restore 40 to customer (→40)
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

	// Events: finalize(-60), check(120)
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

// ─────────────────────────────────────────────────────────────────────────────
// EP-6: customer-level lock=120, confirm=160 — extra deduction continues into ent-2
// Lock=120: customer=0, ent-1=30. Receipt: [customer: 100, ent-1: 20].
// Confirm=160 → delta=+40: deduct 30 more from ent-1 (→0), then 10 from ent-2 (→40).
// Final: customer=0, ent-1 own=0, ent-2 own=40. Customer total=40, ent-1 view=0, ent-2 view=40.
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 120,
		lock: { enabled: true, key: lockKey },
	});

	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
		action: "confirm",
		override_value: 160,
	});

	// delta=+40: exhaust ent-1 remaining 30 (→0), then 10 from ent-2 (→40)
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

	// Events: finalize(+40), check(120)
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

// ─────────────────────────────────────────────────────────────────────────────
// EP-7: entity-level lock on ent-1 + concurrent customer-level track (no lock)
// Lock on ent-1: lock=30 → ent-1 own=20. While lock is held, plain track(10) at
// customer level fires — deducts 10 from customer bucket (→90). Confirm with no
// override_value → early exit (finalValue=lockValue). Receipt deleted.
// Final: customer=90, ent-1 own=20, ent-2 own=50. Total=160, ent-1 view=110, ent-2 view=140.
// Only 2 events: check(30) and the unrelated track(10). No finalize event (early exit).
// ─────────────────────────────────────────────────────────────────────────────

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

	await deleteLock({ ctx, lockKey });

	// Lock ent-1 (deducts 30 from ent-1 bucket)
	await autumnV2_1.check({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, key: lockKey },
	});

	// While lock is held, fire an independent customer-level track
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	// Confirm with no override_value → early exit (finalValue === lockValue=30)
	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
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

	// No finalize event (early exit). Events newest-first: check(30), track(10)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 10 }, { value: 30 }],
	});

	// Receipt must be cleaned up after early-exit confirm
	await expectLockReceiptDeleted({ ctx, lockKey });
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-8: two concurrent entity locks (ent-1 lock A, ent-2 lock B) — independent receipts
// Lock A on ent-1: lock=30 → ent-1 own=20.
// Lock B on ent-2: lock=20 → ent-2 own=30.
// Confirm A (override=15): delta=-15 → restore 15 to ent-1 (→35).
// Confirm B (override=25): delta=+5 → deduct 5 more from ent-2 (→25).
// Final: customer=100, ent-1 own=35, ent-2 own=25.
// Customer total=160, ent-1 view=135, ent-2 view=125.
// ─────────────────────────────────────────────────────────────────────────────

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
		deleteLock({ ctx, lockKey: lockKeyA }),
		deleteLock({ ctx, lockKey: lockKeyB }),
	]);

	// Fire both locks concurrently
	await Promise.all([
		autumnV2_1.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 30,
			lock: { enabled: true, key: lockKeyA },
		}),
		autumnV2_1.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 20,
			lock: { enabled: true, key: lockKeyB },
		}),
	]);

	// Confirm both concurrently with different override values
	await Promise.all([
		autumnV2_1.balances.finalize({
			lock_key: lockKeyA,
			action: "confirm",
			override_value: 15,
		}),
		autumnV2_1.balances.finalize({
			lock_key: lockKeyB,
			action: "confirm",
			override_value: 25,
		}),
	]);

	// Lock A confirm: delta=15-30=-15 → restore 15 to ent-1 (→35)
	// Lock B confirm: delta=25-20=+5 → deduct 5 more from ent-2 (→25)
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
