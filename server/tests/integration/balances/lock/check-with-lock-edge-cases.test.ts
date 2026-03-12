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

// ─────────────────────────────────────────────────────────────────────────────
// Edge case: lock spans multiple entitlement types, then the product is upgraded
// mid-flight (lock held → confirm after upgrade).
//
// Setup:
//   addonProd: lifetimeMessages(100)  — never resets, add-on
//   freeProd:  monthlyMessages(50)    — resets monthly, customer product
//   proProd:   monthlyMessages(80)    — resets monthly, upgrade target
//
// Initial state: lifetime=100, monthly(free)=50. Total=150.
//
// Check lock=60 (no entity_id):
//   Deduction order: monthly(free) → lifetime (monthly exhausted first).
//   monthly: 50→0, lifetime: 100→90.
//   Receipt records: [monthly:50, lifetime:10]. Total after check=90.
//
// Upgrade free→pro:
//   Old monthly(free) entitlement is replaced by monthly(pro)=80.
//   Lifetime addon bucket is unaffected (persists across upgrade).
//   State after upgrade: lifetime=90, monthly(pro)=80. Total=170.
//
// Key: the lock receipt still references the OLD monthly entitlement ID (now gone)
// and the lifetime entitlement ID. On finalize:
//
// EC-1 (confirm override=57, delta=-3 → LIFO refund of 3):
//   LIFO unwinds last bucket first = lifetime. Restore 3 → lifetime=93.
//   monthly(pro) is untouched (not in receipt). Total=173.
//
// EC-2 (confirm override=63, delta=+3 → additional deduction of 3):
//   Continue deducting from lifetime (last bucket). lifetime=90→87.
//   monthly(pro) is untouched (not in receipt). Total=167.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// EC-3: lock on free-only product, upgrade to pro, track on pro, confirm with
// refund — skipped unwind redirects refund onto current (pro) entitlement.
//
// Setup: freeProd monthlyMessages(50) only (no lifetime addon).
// proProd monthlyMessages(80).
//
// check lock=40 on free: monthly(free)=50→10. Receipt: [monthly(free):40].
// Upgrade free→pro: monthly(free) entitlement replaced by monthly(pro)=80.
//   Receipt still references old monthly(free) ID (now gone). Total=80.
// track 20 on pro: monthly(pro)=80→60.
// confirm override=30 → delta = 30-40 = -10 → unwind 10.
//   LIFO: try monthly(free) — not found, skip.
//   remaining_signed_unwind_value = -10 (positive lock, so negate).
//   effective_additional = 0 + (-10) = -10 → refund 10 onto monthly(pro)=60→70.
// Final: monthly(pro)=70. Total=70.
// ─────────────────────────────────────────────────────────────────────────────

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

	// check lock=40: deducts all 40 from monthly(free)=50→10.
	// Receipt: [monthly(free):40]
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

	// Upgrade free→pro. monthly(free) entitlement replaced by monthly(pro)=80.
	// Lock receipt still references the now-gone monthly(free) ID.
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

	// Track 20 on pro to consume some balance, giving room for the refund.
	// monthly(pro)=80→60.
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 20,
	});

	// confirm override=30 → delta = 30-40 = -10 → unwind 10.
	// LIFO: monthly(free) not found → skip, remaining_signed_unwind_value=-10.
	// effective_additional = 0 + (-10) = -10 → refund 10 onto monthly(pro)=60→70.
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

	// Events newest-first: finalize(-10), track(20), check(40)
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

// ─────────────────────────────────────────────────────────────────────────────
// EC-1: lock=60 (crosses monthly→lifetime), upgrade free→pro, confirm=57 (delta=-3)
// LIFO unwind restores 3 to lifetime. monthly(pro) stays at full 80.
// Final: lifetime=93, monthly(pro)=80. Total=173.
// ─────────────────────────────────────────────────────────────────────────────

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
			// Attach addon first (lifetime bucket), then free (monthly bucket)
			s.attach({ productId: addonProd.id }),
			s.attach({ productId: freeProd.id }),
		],
	});

	await deleteLock({ ctx, lockId: lockKey });

	// Check lock=60: exhausts monthly(free)=50, then deducts 10 from lifetime.
	// Receipt: [monthly(free):50, lifetime:10]
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 60,
		lock: { enabled: true, lock_id: lockKey },
	});

	// Verify state after check: total=90 (lifetime=90, monthly=0)
	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	// Upgrade: free→pro. New monthly entitlement (80) replaces old monthly (0).
	// Lifetime addon is unaffected. Lock receipt still references old monthly ID.
	await autumnV2_1.attach({
		customer_id: customerId,
		product_id: proProd.id,
	});

	// Verify state after upgrade: lifetime=90, monthly(pro)=80. Total=170.
	const afterUpgrade =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpgrade,
		featureId: TestFeature.Messages,
		remaining: 170,
	});

	// Confirm override=57 → delta = 57-60 = -3.
	// LIFO: restore 3 to lifetime (last bucket touched). lifetime=90→93.
	// monthly(pro) not in receipt → stays at 80.
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

	// Events newest-first: finalize(-3), check(60).
	// The upgrade does not emit message events (free product, no billing).
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

// ─────────────────────────────────────────────────────────────────────────────
// EC-2: lock=60 (crosses monthly→lifetime), upgrade free→pro, confirm=63 (delta=+3)
// Additional deduction of 3 from lifetime (last bucket). monthly(pro) untouched.
// Final: lifetime=87, monthly(pro)=80. Total=167.
// ─────────────────────────────────────────────────────────────────────────────

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

	// Check lock=60: exhausts monthly(free)=50, deducts 10 from lifetime.
	// Receipt: [monthly(free):50, lifetime:10]
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 60,
		lock: { enabled: true, lock_id: lockKey },
	});

	// Verify state after check: total=90
	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 90,
	});

	// Upgrade free→pro. New monthly(pro)=80 added. Lifetime addon unaffected.
	await autumnV2_1.attach({
		customer_id: customerId,
		product_id: proProd.id,
	});

	// Verify state after upgrade: lifetime=90, monthly(pro)=80. Total=170.
	const afterUpgrade =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterUpgrade,
		featureId: TestFeature.Messages,
		remaining: 170,
	});

	// Confirm override=63 → delta = 63-60 = +3.
	// Continue deducting from lifetime (last bucket in receipt). lifetime=90→87.
	// monthly(pro) not in receipt → stays at 80.
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

	// Events newest-first: finalize(+3), check(60).
	// The upgrade does not emit message events (free product, no billing).
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

// ─────────────────────────────────────────────────────────────────────────────
// EC-4: lock=0, confirm without override.
// Zero-cost receipt should finalize cleanly with no deduction.
// Final: monthly(free)=50. Total=50.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// EC-5: lock=0, confirm override=1.2.
// Finalize should allow an additional deduction even when the lock reserved
// nothing. Final: monthly(free)=48.8. Total=48.8.
// ─────────────────────────────────────────────────────────────────────────────

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
