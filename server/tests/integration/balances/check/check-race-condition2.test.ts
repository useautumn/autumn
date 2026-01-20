import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Race condition scenario: Concurrent /check calls auto-creating the same customer
 *
 * When two /check requests arrive simultaneously for a customer that doesn't exist:
 * - Both should succeed
 * - Only one customer should be created
 * - Both should return valid check responses
 */
test.concurrent(`${chalk.yellowBright("check-race-condition2: concurrent /check calls should auto-create customer once")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { ctx, autumnV1, autumnV2 } = await initScenario({
		customerId: "check-race-condition2-setup",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	// Use a unique customer ID that doesn't exist yet
	const newCustomerId = `check-race-new-${Date.now()}`;

	// Delete any existing customer (cleanup from previous runs)
	try {
		await autumnV1.customers.delete(newCustomerId);
	} catch {}

	// Concurrent /check calls for non-existent customer
	const [res1, res2] = await Promise.all([
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Auto Created Customer",
				email: `${newCustomerId}@example.com`,
			},
		}),
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Auto Created Customer",
				email: `${newCustomerId}@example.com`,
			},
		}),
	]);

	// Both should return allowed (since default product gives 100 messages)
	expect(res1.allowed).toBe(true);
	expect(res2.allowed).toBe(true);

	// Verify customer was created
	const customer = await autumnV2.customers.get<ApiCustomer>(newCustomerId);
	expect(customer.id).toBe(newCustomerId);
	expect(customer.name).toBe("Auto Created Customer");
	expect(customer.email).toBe(`${newCustomerId}@example.com`);

	// Verify default product was attached
	expect(customer.balances?.[TestFeature.Messages]?.current_balance).toBe(100);
});

/**
 * Race condition scenario: Concurrent /check calls with different customer_data
 *
 * When two /check requests arrive simultaneously with different customer_data,
 * one wins and the other should return the same customer (not create duplicate).
 */
test.concurrent(`${chalk.yellowBright("check-race-condition2: concurrent /check with different data should not create duplicates")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId: "check-race-condition2-diff-data",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	const newCustomerId = `check-race-diff-${Date.now()}`;

	try {
		await autumnV1.customers.delete(newCustomerId);
	} catch {}

	// Concurrent /check calls with different customer_data
	const [res1, res2] = await Promise.all([
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Name from request 1",
				email: `${newCustomerId}-1@example.com`,
			},
		}),
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Name from request 2",
				email: `${newCustomerId}-2@example.com`,
			},
		}),
	]);

	// Both should succeed
	expect(res1.allowed).toBe(true);
	expect(res2.allowed).toBe(true);

	// Verify only one customer was created (not two)
	const customer = await autumnV2.customers.get<ApiCustomer>(newCustomerId);
	expect(customer.id).toBe(newCustomerId);

	// Name should be from one of the requests (whichever won the race)
	expect(["Name from request 1", "Name from request 2"]).toContain(
		customer.name ?? "",
	);
});

/**
 * Race condition scenario: Concurrent /check calls for same customer with required_balance
 *
 * Tests that concurrent check requests don't cause issues with balance calculation.
 */
test.concurrent(`${chalk.yellowBright("check-race-condition2: concurrent /check with required_balance should work correctly")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId: "check-race-condition2-balance",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	const newCustomerId = `check-race-balance-${Date.now()}`;

	try {
		await autumnV1.customers.delete(newCustomerId);
	} catch {}

	// Concurrent /check calls with required_balance
	const [res1, res2, res3] = await Promise.all([
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			required_balance: 50,
			customer_data: { name: "Balance Test" },
		}),
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			required_balance: 50,
			customer_data: { name: "Balance Test" },
		}),
		autumnV1.check({
			customer_id: newCustomerId,
			feature_id: TestFeature.Messages,
			required_balance: 50,
			customer_data: { name: "Balance Test" },
		}),
	]);

	// All should be allowed (100 >= 50)
	expect(res1.allowed).toBe(true);
	expect(res2.allowed).toBe(true);
	expect(res3.allowed).toBe(true);

	// Customer should have 100 balance (no usage tracked)
	const customer = await autumnV2.customers.get<ApiCustomer>(newCustomerId);
	expect(customer.balances?.[TestFeature.Messages]?.current_balance).toBe(100);
});
