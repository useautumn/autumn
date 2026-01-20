// import { expect, test } from "bun:test";
// import type { ApiCustomer } from "@autumn/shared";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import { items } from "@tests/utils/fixtures/items.js";
// import { products } from "@tests/utils/fixtures/products.js";
// import { timeout } from "@tests/utils/genUtils.js";
// import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
// import chalk from "chalk";

// /**
//  * Race condition scenario: Concurrent /track calls auto-creating the same customer
//  *
//  * When two /track requests arrive simultaneously for a customer that doesn't exist:
//  * - Both should succeed
//  * - Only one customer should be created
//  * - Usage should be tracked correctly (total of both requests)
//  */
// test.concurrent(`${chalk.yellowBright("track-race-condition5: concurrent /track calls should auto-create customer once")}`, async () => {
// 	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
// 	const freeDefault = products.base({
// 		id: "free",
// 		items: [messagesItem],
// 		isDefault: true,
// 	});

// 	const customerId = "track-race-condition5-setup";

// 	const { autumnV1, autumnV2 } = await initScenario({
// 		customerId,
// 		setup: [
// 			s.customer({ testClock: false }),
// 			s.products({ list: [freeDefault], customerIdsToDelete: [customerId] }),
// 		],
// 		actions: [],
// 	});

// 	// Delete any existing customer (cleanup from previous runs)
// 	try {
// 		await autumnV1.customers.delete(customerId);
// 	} catch {}

// 	// Concurrent /track calls for non-existent customer
// 	const [res1, res2] = await Promise.all([
// 		autumnV1.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Messages,
// 			value: 5,
// 			customer_data: {
// 				name: "Auto Created Customer",
// 				email: `${customerId}@example.com`,
// 			},
// 		}),
// 		autumnV1.track({
// 			customer_id: customerId,
// 			feature_id: TestFeature.Messages,
// 			value: 3,
// 			customer_data: {
// 				name: "Auto Created Customer",
// 				email: `${customerId}@example.com`,
// 			},
// 		}),
// 	]);

// 	// Both should succeed
// 	expect(res1).toBeDefined();
// 	expect(res2).toBeDefined();

// 	// Wait for Redis sync to complete
// 	await timeout(2000);

// 	// Verify customer was created
// 	const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
// 		skip_cache: "true",
// 	});
// 	expect(customer.id).toBe(customerId);
// 	expect(customer.name).toBe("Auto Created Customer");

// 	// Usage should be sum of both requests (5 + 3 = 8)
// 	// Balance should be 100 - 8 = 92
// 	const balance = customer.balances?.[TestFeature.Messages]?.current_balance;
// 	expect(balance).toBe(92);
// });

// /**
//  * Race condition scenario: Concurrent /track calls with different values
//  *
//  * Tests that concurrent track requests correctly accumulate usage.
//  */
// test.concurrent(`${chalk.yellowBright("track-race-condition5: concurrent /track calls should accumulate usage correctly")}`, async () => {
// 	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
// 	const freeDefault = products.base({
// 		id: "free",
// 		items: [messagesItem],
// 		isDefault: true,
// 	});

// 	const { autumnV1, autumnV2 } = await initScenario({
// 		customerId: "track-race-accumulate-setup",
// 		setup: [
// 			s.customer({ testClock: false }),
// 			s.products({ list: [freeDefault] }),
// 		],
// 		actions: [],
// 	});

// 	const newCustomerId = `track-race-accumulate-${Date.now()}`;

// 	try {
// 		await autumnV1.customers.delete(newCustomerId);
// 	} catch {}

// 	// Concurrent /track calls with different values
// 	await Promise.all([
// 		autumnV1.track({
// 			customer_id: newCustomerId,
// 			feature_id: TestFeature.Messages,
// 			value: 10,
// 			customer_data: { name: "Accumulate Test" },
// 		}),
// 		autumnV1.track({
// 			customer_id: newCustomerId,
// 			feature_id: TestFeature.Messages,
// 			value: 20,
// 			customer_data: { name: "Accumulate Test" },
// 		}),
// 		autumnV1.track({
// 			customer_id: newCustomerId,
// 			feature_id: TestFeature.Messages,
// 			value: 30,
// 			customer_data: { name: "Accumulate Test" },
// 		}),
// 	]);

// 	// Wait for Redis sync to complete
// 	await timeout(2000);

// 	// Verify total usage is accumulated correctly (10 + 20 + 30 = 60)
// 	const customer = await autumnV2.customers.get<ApiCustomer>(newCustomerId, {
// 		skip_cache: "true",
// 	});

// 	// Balance should be 1000 - 60 = 940
// 	expect(customer.balances?.[TestFeature.Messages]?.current_balance).toBe(940);
// 	expect(customer.balances?.[TestFeature.Messages]?.usage).toBe(60);
// });

// /**
//  * Race condition scenario: Concurrent /track calls that would exceed balance
//  *
//  * Tests that concurrent track requests handle balance correctly when total would exceed limit.
//  */
// test.concurrent(`${chalk.yellowBright("track-race-condition5: concurrent /track calls handle balance limits correctly")}`, async () => {
// 	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
// 	const freeDefault = products.base({
// 		id: "free",
// 		items: [messagesItem],
// 		isDefault: true,
// 	});

// 	const { autumnV1, autumnV2 } = await initScenario({
// 		customerId: "track-race-condition5-limits",
// 		setup: [
// 			s.customer({ testClock: false }),
// 			s.products({ list: [freeDefault] }),
// 		],
// 		actions: [],
// 	});

// 	const newCustomerId = `track-race-limits-${Date.now()}`;

// 	try {
// 		await autumnV1.customers.delete(newCustomerId);
// 	} catch {}

// 	// Concurrent /track calls that together would exceed balance
// 	// 50 + 60 = 110 > 100 limit
// 	await Promise.all([
// 		autumnV1.track({
// 			customer_id: newCustomerId,
// 			feature_id: TestFeature.Messages,
// 			value: 50,
// 			customer_data: { name: "Limits Test" },
// 		}),
// 		autumnV1.track({
// 			customer_id: newCustomerId,
// 			feature_id: TestFeature.Messages,
// 			value: 60,
// 			customer_data: { name: "Limits Test" },
// 		}),
// 	]);

// 	// Wait for Redis sync to complete
// 	await timeout(2000);

// 	// Verify usage tracking
// 	const customer = await autumnV2.customers.get<ApiCustomer>(newCustomerId, {
// 		skip_cache: "true",
// 	});

// 	// Total usage should be 50 + 60 = 110 (allowed to exceed since no overage restrictions)
// 	const balance = customer.balances?.[TestFeature.Messages];
// 	expect(balance?.usage).toBe(110);
// 	// Balance would be negative (100 - 110 = -10) if allowed, or capped at 0
// 	expect(balance?.current_balance).toBeLessThanOrEqual(0);
// });
