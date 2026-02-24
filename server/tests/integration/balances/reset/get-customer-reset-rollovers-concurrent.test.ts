import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type CheckResponseV2,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const rolloverConfig = {
	max: 500,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

// ─────────────────────────────────────────────────────────────────
// Concurrent GET /customers with rollover — reset exactly once
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple GETs all return reset balance with rollover")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-get",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250, timeout: 2000 }),
		],
	});

	// Before reset: 400 - 250 = 150 remaining
	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(150);

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent GET requests — all should see reset balance with rollover
	// Expected: rollover = min(150, 500) = 150, fresh grant = 400, total = 550
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.customers.get<ApiCustomer>(customerId),
		),
	);

	for (const customer of results) {
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(550);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
		expect(customer.balances[TestFeature.Messages].rollovers).toBeDefined();
		expect(customer.balances[TestFeature.Messages].rollovers!.length).toBe(1);
		expect(customer.balances[TestFeature.Messages].rollovers![0].balance).toBe(
			150,
		);
	}

	// DB should also reflect the reset (only applied once)
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	expect(cusEntAfter!.rollovers.length).toBe(1);
});

// ─────────────────────────────────────────────────────────────────
// Concurrent checks with rollover — all return reset balance
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple checks all return reset balance with rollover")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-check",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	// Before reset: 400 - 100 = 300 remaining
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent check requests
	// Expected: rollover = min(300, 500) = 300, fresh grant = 400, total = 700
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			}),
		),
	);

	for (const res of results) {
		const check = res as unknown as CheckResponseV2;
		expect(check.allowed).toBe(true);
		expect(check.balance?.current_balance).toBe(700);
		expect(check.balance?.usage).toBe(0);
	}
});

// ─────────────────────────────────────────────────────────────────
// Concurrent tracks with rollover — reset once, deductions atomic
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: multiple tracks reset once then deduct atomically")}`, async () => {
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 400,
		rolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-track",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
		],
	});

	// Before reset: 400 - 200 = 200 remaining
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent tracks of 10 each
	// Expected: rollover = min(200, 500) = 200, fresh grant = 400, total = 600
	// Then deduct 50 total → 550
	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
		),
	);

	// Verify final balance: 600 (reset) - 50 (5 * 10) = 550
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(customer.balances[TestFeature.Messages].usage).toBe(50);
	expect(customer.balances[TestFeature.Messages].rollovers).toBeDefined();
	expect(customer.balances[TestFeature.Messages].rollovers!.length).toBe(1);

	// Wait for DB sync and verify DB agrees
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages].current_balance).toBe(550);
	expect(customerDb.balances[TestFeature.Messages].usage).toBe(50);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	// Only 1 rollover should exist (not duplicated by concurrent requests)
	expect(cusEntAfter!.rollovers.length).toBe(1);
});

// ─────────────────────────────────────────────────────────────────
// Concurrent GETs after multiple resets — excess rollovers cleared from cache
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent rollover reset: excess rollovers cleared from cache after max cap")}`, async () => {
	const maxRolloverConfig = {
		max: 80,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};
	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 100,
		rolloverConfig: maxRolloverConfig,
	});
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "reset-rollover-conc-max-clear",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	// Before first reset: 100 - 50 = 50 remaining
	const before = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(before.balances[TestFeature.Messages].current_balance).toBe(50);

	// --- First reset: rollover(50), fresh grant 100, total = 150 ---
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const afterReset1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterReset1.balances[TestFeature.Messages].current_balance).toBe(150);
	expect(afterReset1.balances[TestFeature.Messages].rollovers!.length).toBe(1);
	expect(afterReset1.balances[TestFeature.Messages].rollovers![0].balance).toBe(
		50,
	);

	// --- Second reset: balance is 100 (not tracked), creates rollover(100) ---
	// Total rollovers: [old(50), new(100)] = 150 > max(80)
	// After clearing: old deleted, new trimmed to 80 → 1 rollover with 80
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent GETs to trigger the second reset.
	// The winner applies clearing (delete old rollover, trim new to 80).
	// Losers may read DB before clearing finishes, so concurrent results
	// can transiently show uncapped rollovers. That's expected.
	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.customers.get<ApiCustomer>(customerId),
		),
	);

	// After all concurrent requests settle, cache and DB should be consistent.
	// A fresh GET should return the max-cleared state:
	// 1 rollover with balance=80, fresh grant=100, total=180
	const afterSettle = await autumnV2.customers.get<ApiCustomer>(customerId);
	const msgBalance = afterSettle.balances[TestFeature.Messages];
	expect(msgBalance.current_balance).toBe(180);
	expect(msgBalance.usage).toBe(0);
	expect(msgBalance.rollovers).toBeDefined();
	expect(msgBalance.rollovers!.length).toBe(1);
	expect(msgBalance.rollovers![0].balance).toBe(80);

	// DB should also reflect the cleared state
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
	expect(cusEntAfter!.rollovers.length).toBe(1);
	expect(cusEntAfter!.rollovers[0].balance).toBe(80);
});
