import { expect, test } from "bun:test";
import type { ApiCustomer, CheckResponseV2 } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────
// Concurrent GET /customers — multiple reads trigger reset exactly once
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent reset: multiple GET customers all return reset balance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-concurrent-get",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 40,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent GET requests — all should see reset balance
	const results = await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.customers.get<ApiCustomer>(customerId),
		),
	);

	for (const customer of results) {
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(100);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
	}

	// DB should also reflect the reset (only applied once)
	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});

// ─────────────────────────────────────────────────────────────────
// Concurrent checks — all return reset balance
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent reset: multiple checks all return reset balance")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-concurrent-check",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 70,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent check requests
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
		expect(check.balance?.current_balance).toBe(100);
		expect(check.balance?.usage).toBe(0);
	}
});

// ─────────────────────────────────────────────────────────────────
// Concurrent tracks — reset once, all deductions applied atomically
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent reset: multiple tracks reset once then deduct atomically")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-concurrent-track",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire 5 concurrent tracks of 10 each — should reset to 100, then deduct 50 total
	await Promise.all(
		Array.from({ length: 5 }, () =>
			autumnV2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			}),
		),
	);

	// Verify final balance: 100 (reset) - 50 (5 * 10) = 50
	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages].current_balance).toBe(50);
	expect(customer.balances[TestFeature.Messages].usage).toBe(50);

	// Wait for DB sync and verify DB agrees
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages].current_balance).toBe(50);
	expect(customerDb.balances[TestFeature.Messages].usage).toBe(50);
});

// ─────────────────────────────────────────────────────────────────
// Mixed concurrent: GET + check + track all hit a stale cusEnt
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("concurrent reset: mixed GET/check/track all handle stale cusEnt correctly")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "reset-concurrent-mixed",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 80,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Fire mixed concurrent requests: 2 GETs, 2 checks, 1 track(15)
	const [get1, get2, check1, check2, _trackRes] = await Promise.all([
		autumnV2.customers.get<ApiCustomer>(customerId),
		autumnV2.customers.get<ApiCustomer>(customerId),
		autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}) as unknown as Promise<CheckResponseV2>,
		autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}) as unknown as Promise<CheckResponseV2>,
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 15,
		}),
	]);

	// GETs should show reset balance (may or may not include the track deduction depending on ordering)
	for (const customer of [get1, get2]) {
		// Balance should be >= 85 (reset 100 minus at most 15 from track)
		expect(
			customer.balances[TestFeature.Messages].current_balance,
		).toBeGreaterThanOrEqual(85);
		expect(
			customer.balances[TestFeature.Messages].current_balance,
		).toBeLessThanOrEqual(100);
	}

	// Checks should show reset balance
	for (const check of [check1, check2]) {
		expect(check.allowed).toBe(true);
		expect(check.balance?.current_balance).toBeGreaterThanOrEqual(85);
		expect(check.balance?.current_balance).toBeLessThanOrEqual(100);
	}

	// Wait for dust to settle, verify final state
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const finalDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	// Final balance must be exactly 85: reset to 100, one track of 15
	expect(finalDb.balances[TestFeature.Messages].current_balance).toBe(85);
	expect(finalDb.balances[TestFeature.Messages].usage).toBe(15);

	const cusEntAfter = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEntAfter).toBeDefined();
	expect(cusEntAfter!.next_reset_at).toBeGreaterThan(Date.now());
});
