/**
 * Migration Error Tests
 *
 * Tests for migration error cases and validation.
 * Ensures migrations fail gracefully with proper error messages.
 *
 * Key behaviors:
 * - Free → Paid migration should error
 * - One-off products cannot be migrated
 * - Prepaid feature mismatches should error
 * - Concurrent migrations for same product should error
 */

import { expect, test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const _waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Paid Migration (Error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Try to migrate to paid product
 *
 * Expected Result:
 * - Error: Cannot migrate from free to paid
 */
test.concurrent(`${chalk.yellowBright("migrate-errors-1: free to paid migration should error")}`, async () => {
	const customerId = "migrate-err-free-to-paid";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: "free" })],
	});

	// Try to migrate from free to paid - should error

	await expectAutumnError({
		func: async () => {
			await autumnV1.migrate({
				from_product_id: free.id,
				to_product_id: pro.id,
				from_version: 1,
				to_version: 1,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Migrate FROM One-Off Product (Error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has one-off product
 * - Try to migrate to another version
 *
 * Expected Result:
 * - Error: Cannot migrate one-off products
 */
test.concurrent(`${chalk.yellowBright("migrate-errors-2: migrate from one-off product should error")}`, async () => {
	const customerId = "migrate-err-from-oneoff";

	const oneOff = products.oneOff({
		id: "one-off",
		items: [items.oneOffMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [s.billing.attach({ productId: "one-off" })],
	});

	// Update to v2
	await autumnV1.products.update(oneOff.id, {
		items: [items.oneOffMessages({ includedUsage: 200 })],
	});

	// Try to migrate one-off product - should error
	await expectAutumnError({
		func: async () => {
			await autumnV1.migrate({
				from_product_id: oneOff.id,
				to_product_id: oneOff.id,
				from_version: 1,
				to_version: 2,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Migrate TO One-Off Product (Error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro product
 * - Try to migrate to one-off product
 *
 * Expected Result:
 * - Error: Cannot migrate to one-off products
 */
test.concurrent(`${chalk.yellowBright("migrate-errors-3: migrate to one-off product should error")}`, async () => {
	const customerId = "migrate-err-to-oneoff";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [items.oneOffMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, oneOff] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// Try to migrate to one-off product - should error
	await expectAutumnError({
		func: async () => {
			await autumnV1.migrate({
				from_product_id: pro.id,
				to_product_id: oneOff.id,
				from_version: 1,
				to_version: 1,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: New Product Has Prepaid Feature Old Doesn't (Error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro product with monthly messages (no prepaid)
 * - Update product to v2 with prepaid messages
 * - Try to migrate
 *
 * Expected Result:
 * - Error: Can't perform migration (prepaid feature mismatch)
 */
test.concurrent(`${chalk.yellowBright("migrate-errors-4: new product has prepaid feature old doesn't")}`, async () => {
	const customerId = "migrate-err-prepaid-mismatch";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// Update to v2 with prepaid messages instead of monthly
	await autumnV1.products.update(pro.id, {
		items: [items.prepaidMessages({ includedUsage: 0, billingUnits: 100 })],
	});

	// Try to migrate - should error due to prepaid mismatch
	await expectAutumnError({
		func: async () => {
			await autumnV1.migrate({
				from_product_id: pro.id,
				to_product_id: pro.id,
				from_version: 1,
				to_version: 2,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Concurrent Migrations for Same Product (Error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro v1
 * - Update product to v2 and v3
 * - Try to run two migrations concurrently (v1→v2 and v1→v3)
 *
 * Expected Result:
 * - One should succeed, one should error with "migration is ongoing"
 */
test.concurrent(`${chalk.yellowBright("migrate-errors-5: concurrent migrations for same product should error")}`, async () => {
	const customerId = "migrate-err-concurrent";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// Update to v2
	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 600 }),
		],
	});

	// Update to v3
	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 25 }),
			items.monthlyMessages({ includedUsage: 700 }),
		],
	});

	// Try to run two migrations concurrently - one should fail
	const migration1 = autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	const migration2 = autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	const results = await Promise.allSettled([migration1, migration2]);

	// One should succeed, one should fail with the "migration is ongoing" error
	const successes = results.filter((r) => r.status === "fulfilled");
	const failures = results.filter((r) => r.status === "rejected");

	expect(successes.length).toBe(1);
	expect(failures.length).toBe(1);

	// The failure should have the "migration is ongoing" message
	const failedResult = failures[0] as PromiseRejectedResult;
	expect(failedResult.reason.message).toInclude("Another migration is ongoing");
});
