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

// Product: hourlyMessages(5) + monthlyMessages(10) = 15 total

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	return products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});
};

// ─────────────────────────────────────────────────────────────────────────────
// PG-1: skip_cache on check, normal confirm — partial refund
// check(skip_cache=true, required_balance=8) → deducts from Postgres path.
// confirm(override_value=5) → delta=-3 → unwind 3 → remaining=10.
// Assert both cached and DB balances match.
// ─────────────────────────────────────────────────────────────────────────────

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

	// Cached balance
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	// Events: finalize delta (-3), check (8)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -3 }, { value: 8 }],
	});

	// DB balance
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

// ─────────────────────────────────────────────────────────────────────────────
// PG-2: skip_cache on finalize only — extra deduction confirm
// check(required_balance=8) → normal Redis deduction → remaining=7.
// confirm(skip_cache=true, override_value=11) → delta=+3 → Postgres deduction.
// remaining=15-11=4. Assert cached and DB balances.
// ─────────────────────────────────────────────────────────────────────────────

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

	// Cached balance
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 4,
	});

	// Events: finalize delta (+3), check (8)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 3 }, { value: 8 }],
	});

	// DB balance
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

// ─────────────────────────────────────────────────────────────────────────────
// PG-3: skip_cache on both check and finalize — cross-bucket lock + refund
// check(skip_cache=true, required_balance=8) → Postgres deduction across
// hourly(5) + monthly(3). confirm(skip_cache=true, override_value=3) →
// delta=-5 → LIFO unwind: restore 3 from monthly, 2 from hourly.
// hourly=4, monthly=9 → remaining=13.
// Assert both cached and DB balances.
// ─────────────────────────────────────────────────────────────────────────────

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

	// Cached balance: 15 - 3 = 12 — wait, hourly(5-2=3) + monthly(10-1=9) = 12
	// lock=8 deducts 5 from hourly + 3 from monthly.
	// confirm=3: delta = 3-8 = -5 → unwind LIFO: restore 3 from monthly (→10), 2 from hourly (→4).
	// Net: hourly=4, monthly=9 → total remaining=13. Wait: 4+9=13, not 12. Let's be precise:
	// After lock: hourly=0, monthly=7 → total=7
	// After confirm(3): unwind -5 → restore 3 to monthly(→10) then 2 to hourly(→2)
	//   = hourly=2, monthly=10 → total=12?
	// Re-derive: lock=8, hourly=5, monthly=10 → deduct 5 from hourly(→0), 3 from monthly(→7). Total=7.
	// confirm=3, locked=8, delta=-5 → unwind -5 LIFO: restore 3 to monthly(→10) then 2 to hourly(→2).
	// hourly=2, monthly=10 → remaining=12.

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 12,
	});

	// Events: finalize delta (-5), check (8)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -5 }, { value: 8 }],
	});

	// DB balance
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
