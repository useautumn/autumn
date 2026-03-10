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
// AD-1: lock=8, confirm=11 → remaining=4
// No unwind, deduct 3 more on top of the lock: 15-8-3=4
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("additional-deduct AD-1: lock=8 confirm=11 — extra deduction, remaining=4")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-add-deduct-1";

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
		override_value: 11,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 4,
	});

	// lock=8 (lockValue=8), confirm=11 (finalValue=11), delta = 11-8 = 3
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 3 }, { value: 8 }],
	});

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
// AD-2: track=10, lock=-5, confirm=-8 → remaining=13
// track(10) → balance=5. Negative lock credits 5 (→10). confirm=-8 credits 3 more (→13).
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("additional-deduct AD-2: track=10 lock=-5 confirm=-8 — more credit, remaining=13")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-add-deduct-2";

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
		override_value: -8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 13,
	});

	// lock=-5 (lockValue=-5), confirm=-8 (finalValue=-8), delta = -8-(-5) = -3
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -3 }, { value: -5 }, { value: 10 }],
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AD-3: lock=5, confirm=-2 → remaining=17
// Cross-zero from positive lock: unwind 5 (→15), then credit 2 (→17)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("additional-deduct AD-3: lock=5 confirm=-2 — cross-zero to credit, remaining=math.min(15,17)")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-add-deduct-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: -2,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	// lock=5 (lockValue=5), confirm=-2 (finalValue=-2), delta = -2-5 = -7
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -7 }, { value: 5 }],
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AD-4: track=10, lock=-3, confirm=-8 → remaining=13
// track(10) → balance=5. Negative lock credits 3 (→8). confirm=-8 credits 5 more (→13).
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("additional-deduct AD-4: track=10 lock=-3 confirm=-8 — additional credit, remaining=13")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-add-deduct-4";

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
		required_balance: -3,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: -8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 13,
	});

	// lock=-3 (lockValue=-3), confirm=-8 (finalValue=-8), delta = -8-(-3) = -5
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -5 }, { value: -3 }, { value: 10 }],
	});
});
