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

// ─────────────────────────────────────────────────────────────────────────────
// Lock + Rollover tests
//
// Product: monthlyMessages(100) with rolloverConfig { max: 200, length: 1, duration: Month }
// Rollovers are created via s.resetFeature() which directly triggers the reset
// cron logic without needing a test clock.
//
// Deduction order: oldest rollover first, then newer rollovers, then main entitlement.
// LIFO unwind (on confirm with refund): main entitlement first, then newer rollovers,
// then older rollovers — reverse of deduction order.
//
// RO-1: Refund crosses main→rollover[1] boundary (two rollover buckets)
// RO-2: Refund crosses main→rollover boundary (single rollover bucket)
// RO-3: Additional deduction crosses rollover→main boundary
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// RO-1: Refund across multiple rollover boundaries
//
// Setup:
//   reset (no usage) → rollover[0]=100, main resets to 100. Total=200.
//   reset (no usage) → rollover[1]=100, main resets to 100. Total=300 (r[0]=100, r[1]=100, main=100).
//
// check lock=250:
//   Deduction order: r[0]=100 (exhausted), r[1]=100 (exhausted), main=50.
//   After check: r[0]=0, r[1]=0, main=50. Total=50.
//   Receipt: [r[0]:100, r[1]:100, main:50]
//
// confirm override=180 → delta = 180-250 = -70 → refund 70:
//   LIFO: unwind main=50 fully → main=100. Remaining=20.
//   Unwind r[1]=20 (of 100 in receipt) → r[1]=20. Remaining=0. r[0] stays 0.
//   Final: r[0]=0, r[1]=20, main=100. Total=120.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-rollover RO-1: lock across two rollovers + main, confirm with refund crossing main→rollover[1] boundary")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-ro-1";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			// Cycle 1: no usage, reset → rollover[0]=100
			s.resetFeature({ featureId: TestFeature.Messages }),
			// Cycle 2: no usage, reset → rollover[1]=100
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	await deleteLock({ ctx, lockKey });

	// Verify state after setup: r[0]=100, r[1]=100, main=100. Total=300.
	const afterSetup = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterSetup,
		featureId: TestFeature.Messages,
		remaining: 300,
		rollovers: [{ balance: 100 }, { balance: 100 }],
	});

	// check lock=250: exhausts r[0]=100, r[1]=100, deducts 50 from main.
	// Receipt: [r[0]:100, r[1]:100, main:50]
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 250,
		lock: { enabled: true, key: lockKey },
	});

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 50,
		rollovers: [{ balance: 0 }, { balance: 0 }],
	});

	// confirm override=180 → delta = -70 → refund 70.
	// LIFO: unwind main=50 fully → main=100. Remaining=20.
	// Unwind r[1]=20 → r[1]=20. r[0] stays 0.
	// Final: r[0]=0, r[1]=20, main=100. Total=120.
	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
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

	// Events newest-first: finalize(-70), check(250). No track events (resets don't emit).
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

// ─────────────────────────────────────────────────────────────────────────────
// RO-3: Additional deduction past rollover boundary
//
// Setup:
//   reset (no usage) → rollover[0]=100, main resets to 100. Total=200.
//
// check lock=30:
//   Deduction order: r[0]=30. After: r[0]=70, main=100. Total=170.
//   Receipt: [r[0]:30]
//
// confirm override=150 → delta = 150-30 = +120 → additional deduction of 120.
//   Full unwind of receipt: r[0] restored to 100. Then re-deduct 150 total.
//   Re-deduct 150: r[0]=100→0, main=100→50.
//   Final: r[0]=0, main=50. Total=50.
//
// Event value = override_value - locked_value = 150-30 = 120.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("lock-rollover RO-3: lock within rollover, confirm with extra deduction past rollover→main boundary")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-ro-3";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [
			s.attach({ productId: freeProd.id }),
			// No usage before reset → full rollover of 100
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	await deleteLock({ ctx, lockKey });

	// Verify state after setup: r[0]=100, main=100. Total=200.
	const afterSetup = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterSetup,
		featureId: TestFeature.Messages,
		remaining: 200,
		rollovers: [{ balance: 100 }],
	});

	// check lock=30: deducts 30 from r[0].
	// Receipt: [r[0]:30]
	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 30,
		lock: { enabled: true, key: lockKey },
	});

	const afterCheck = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: afterCheck,
		featureId: TestFeature.Messages,
		remaining: 170,
		rollovers: [{ balance: 70 }],
	});

	// confirm override=150 → delta = +120 → additional deduction of 120.
	// Fully unwind receipt (restore 30 to r[0] → r[0]=100), then re-deduct 150.
	// Re-deduct 150: r[0]=100→0, main=100→50.
	// Final: r[0]=0, main=50. Total=50.
	await autumnV2_1.balances.finalize({
		lock_key: lockKey,
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

	// Events newest-first: finalize(delta=120), check(30). No track events.
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
