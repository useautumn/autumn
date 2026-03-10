import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
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
// RF-1: lock=8, confirm=5 → remaining=10
// Unwind 3 (8 deducted, 5 kept), 15-5=10
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund RF-1: lock=8 confirm=5 — partial keep, remaining=10")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-refund-1";
	const finalizeProperties = { source: "refund-rf-1" };

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
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 5,
		properties: finalizeProperties,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -3, properties: finalizeProperties }, { value: 8 }],
	});

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
// RF-2: lock=8, confirm=-3 → remaining=18
// Negative confirm = credit 3 back on top: 15-8 → 7, then unwind 8 and credit 3 → 18
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund RF-2: lock=8 confirm=-3 — credit beyond lock, remaining=18")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-refund-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: -3,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 13,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -11 }, { value: 8 }, { value: 5 }],
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RF-3: lock=-5, confirm=-3 → remaining=18
// Negative lock = credit 5 (balance→20), negative confirm=-3 means keep credit of 3 → 18
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund RF-3: lock=-5 confirm=-3 — negative lock with partial release, remaining=18")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-refund-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: -5,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: -3,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 8,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 2 }, { value: -5 }, { value: 10 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 8,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RF-4: lock=-5, confirm=3 → remaining=12
// Negative lock = credit 5 (balance→20), confirm=3 = deduct 3 → 12
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund RF-4: lock=-5 confirm=3 — cross-zero confirm, remaining=12")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-refund-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 10,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: -5,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 3,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 2,
	});

	// lock=-5 (lockValue=-5), confirm=3 (finalValue=3), delta = 3-(-5) = 8
	// prior track=10, newest-first: finalize delta, check track, prior track
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 8 }, { value: -5 }, { value: 10 }],
	});
});
