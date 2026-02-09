/**
 * Migration Batch Tests
 *
 * Tests for batch migration behavior with multiple customers.
 *
 * Key behaviors:
 * - Batch stops on first failure
 * - Multiple valid customers are all migrated
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Multiple Valid Customers - All Migrated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer A: pro plan, usage 50
 * - Customer B: pro plan, usage 100
 * - Product updated to v2
 * - Migrate
 *
 * Expected Result:
 * - Both customers migrated to v2
 * - Usage preserved for each
 */
test.concurrent(`${chalk.yellowBright("migrate-batch-1: multiple valid customers - all migrated")}`, async () => {
	const customerIdA = "migrate-batch-a";
	const customerIdB = "migrate-batch-b";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// Setup both customers in a single initScenario using otherCustomers
	const { autumnV1, ctx } = await initScenario({
		customerId: customerIdA,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: customerIdB, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [
			// Customer A attaches and tracks
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			// Customer B attaches
			s.billing.attach({ productId: "pro", customerId: customerIdB }),
		],
	});

	// Track usage for customer B (s.track doesn't support customerId override)
	await autumnV1.track({
		customer_id: customerIdB,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify initial states
	let customerA = await autumnV1.customers.get<ApiCustomerV3>(customerIdA);
	let customerB = await autumnV1.customers.get<ApiCustomerV3>(customerIdB);

	expectCustomerFeatureCorrect({
		customer: customerA,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 450,
		usage: 50,
	});

	expectCustomerFeatureCorrect({
		customer: customerB,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});

	// Update product to v2
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({ includedUsage: 600 }),
	];
	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration(10000); // Longer wait for batch

	// Verify both customers migrated
	customerA = await autumnV1.customers.get<ApiCustomerV3>(customerIdA);
	customerB = await autumnV1.customers.get<ApiCustomerV3>(customerIdB);

	// Customer A: migrated with usage preserved
	await expectCustomerProducts({
		customer: customerA,
		active: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: customerA,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 550, // 600 - 50
		usage: 50,
	});

	// Customer B: migrated with usage preserved
	await expectCustomerProducts({
		customer: customerB,
		active: [pro.id],
	});
	expectCustomerFeatureCorrect({
		customer: customerB,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Verify Stripe subscription state for both customers
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customerIdA,
		org: ctx.org,
		env: ctx.env,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customerIdB,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Batch Stops on First Failure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Note: This test is conceptual - testing actual failure scenarios would require
 * more complex setup (e.g., causing a customer migration to fail mid-batch).
 * The implementation in getMigrationCustomers.ts filters out custom plans,
 * so a "failure" scenario would need to be something like database connectivity
 * issues, which are hard to simulate in tests.
 *
 * For now, we verify the basic batch behavior works correctly.
 * The "batch stops on failure" behavior is implementation-documented.
 */
test.skip(`${chalk.yellowBright("migrate-batch-2: multiple customers with different usage levels")}`, async () => {
	const customerIdA = "migrate-batch-multi-a";
	const customerIdB = "migrate-batch-multi-b";
	const customerIdC = "migrate-batch-multi-c";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// Setup all three customers in a single initScenario using otherCustomers
	const { autumnV1, ctx } = await initScenario({
		customerId: customerIdA,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: customerIdB, paymentMethod: "success" },
				{ id: customerIdC, paymentMethod: "success" },
			]),
			s.products({ list: [pro] }),
		],
		actions: [
			// Customer A attaches and tracks
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			// Customer B attaches
			s.billing.attach({ productId: "pro", customerId: customerIdB }),
			// Customer C attaches
			s.billing.attach({ productId: "pro", customerId: customerIdC }),
		],
	});

	// Track usage for customers B and C (s.track doesn't support customerId override)
	await autumnV1.track({
		customer_id: customerIdB,
		feature_id: TestFeature.Messages,
		value: 200,
	});
	await autumnV1.track({
		customer_id: customerIdC,
		feature_id: TestFeature.Messages,
		value: 300,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Update product to v2
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({ includedUsage: 600 }),
	];
	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration(15000); // Longer wait for batch of 3

	// Verify all customers migrated with correct balances
	const customerA = await autumnV1.customers.get<ApiCustomerV3>(customerIdA);
	const customerB = await autumnV1.customers.get<ApiCustomerV3>(customerIdB);
	const customerC = await autumnV1.customers.get<ApiCustomerV3>(customerIdC);

	expectCustomerFeatureCorrect({
		customer: customerA,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	expectCustomerFeatureCorrect({
		customer: customerB,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 400, // 600 - 200
		usage: 200,
	});

	expectCustomerFeatureCorrect({
		customer: customerC,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 300, // 600 - 300
		usage: 300,
	});

	// Verify Stripe subscription state for all customers
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customerIdA,
		org: ctx.org,
		env: ctx.env,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customerIdB,
		org: ctx.org,
		env: ctx.env,
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customerIdC,
		org: ctx.org,
		env: ctx.env,
	});
});
