/**
 * Free Product Migration Tests
 *
 * Tests for migrating customers from one version of a free product to another.
 * Free products have no Stripe subscription, so migrations only update
 * customer entitlements and customer products.
 *
 * Key behaviors:
 * - Usage is carried over during migration
 * - Balance is recalculated based on new included usage
 * - Product version is updated
 * - No billing changes (free → free)
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Free - Increase Included Usage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product v1 (500 messages)
 * - Customer uses 100 messages
 * - Product updated to v2 (600 messages)
 * - Migrate customer
 *
 * Expected Result:
 * - included_usage = 600 (v2's value)
 * - usage = 100 (carried over)
 * - balance = 500 (600 - 100)
 */
test.concurrent(`${chalk.yellowBright("migrate-free-1: increase included usage with existing usage")}`, async () => {
	const customerId = "migrate-free-increase";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: "free" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	// Product ID is prefixed with customerId by initScenario (mutates free.id)
	const productId = free.id; // Already prefixed to "free_migrate-free-increase"

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400, // 500 - 100
		usage: 100,
	});

	// Update product to v2 with more included usage
	const v2Items = [items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(productId, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: productId,
		to_product_id: productId,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [productId],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600, // v2's included usage
		balance: 500, // 600 - 100 (usage carried over)
		usage: 100,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free to Free - Decrease Included Usage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product v1 (500 messages)
 * - Customer uses 100 messages
 * - Product updated to v2 (400 messages)
 * - Migrate customer
 *
 * Expected Result:
 * - included_usage = 400 (v2's value)
 * - usage = 100 (carried over)
 * - balance = 300 (400 - 100)
 */
test.concurrent(`${chalk.yellowBright("migrate-free-2: decrease included usage with existing usage")}`, async () => {
	const customerId = "migrate-free-decrease";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: "free" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	const productId = free.id;

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});

	// Update product to v2 with less included usage
	const v2Items = [items.monthlyMessages({ includedUsage: 400 })];
	await autumnV1.products.update(productId, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: productId,
		to_product_id: productId,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [productId],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 400,
		balance: 300, // 400 - 100
		usage: 100,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Free to Free - Multiple Features
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product v1 (500 messages, 100 words)
 * - Customer uses 100 messages and 25 words
 * - Product updated to v2 (600 messages, 50 words)
 * - Migrate customer
 *
 * Expected Result:
 * - Messages: included=600, usage=100, balance=500
 * - Words: included=50, usage=25, balance=25
 */
test.concurrent(`${chalk.yellowBright("migrate-free-3: multiple features with usage")}`, async () => {
	const customerId = "migrate-free-multi";

	const free = products.base({
		id: "free",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyWords({ includedUsage: 100 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: "free" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.track({ featureId: TestFeature.Words, value: 25, timeout: 2000 }),
		],
	});

	const productId = free.id;

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 75,
		usage: 25,
	});

	// Update product to v2 with different included usage for both features
	const v2Items = [
		items.monthlyMessages({ includedUsage: 600 }),
		items.monthlyWords({ includedUsage: 50 }),
	];
	await autumnV1.products.update(productId, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: productId,
		to_product_id: productId,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [productId],
	});

	// Messages: increased from 500 to 600
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Words: decreased from 100 to 50
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 25, // 50 - 25
		usage: 25,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Free to Free - No Usage Tracked
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product v1 (500 messages)
 * - No usage tracked
 * - Product updated to v2 (600 messages)
 * - Migrate customer
 *
 * Expected Result:
 * - included_usage = 600
 * - usage = 0
 * - balance = 600
 */
test.concurrent(`${chalk.yellowBright("migrate-free-4: no usage tracked")}`, async () => {
	const customerId = "migrate-free-no-usage";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.billing.attach({ productId: "free" })],
	});

	const productId = free.id;

	// Verify initial state - no usage
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Update product to v2
	const v2Items = [items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(productId, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: productId,
		to_product_id: productId,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [productId],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Free to Free - Usage Exceeds New Included (Overage) with Allocated Feature
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product v1 (500 messages, 10 workflows)
 * - Customer uses 400 messages and 15 workflows (5 over limit)
 * - Product updated to v2 (300 messages, 5 workflows)
 * - Migrate customer
 *
 * Expected Result:
 * - Messages: included_usage = 300, usage = 400, balance = -100 (overage)
 * - Workflows: included_usage = 5, usage = 15, balance = -10 (overage, carried over)
 */
test.concurrent(`${chalk.yellowBright("migrate-free-5: usage exceeds new included (overage) with allocated")}`, async () => {
	const customerId = "migrate-free-overage";

	const free = products.base({
		id: "free",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.freeAllocatedWorkflows({ includedUsage: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: "free" }),
			s.track({ featureId: TestFeature.Messages, value: 400, timeout: 2000 }),
			s.track({ featureId: TestFeature.Workflows, value: 15, timeout: 2000 }),
		],
	});

	const productId = free.id;

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 100, // 500 - 400
		usage: 400,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 10,
		balance: -5, // 10 - 15 = -5 (overage)
		usage: 15,
	});

	// Update product to v2 with less included usage than current usage for both features
	const v2Items = [
		items.monthlyMessages({ includedUsage: 300 }),
		items.freeAllocatedWorkflows({ includedUsage: 5 }),
	];
	await autumnV1.products.update(productId, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: productId,
		to_product_id: productId,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [productId],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 0, // 300 - 400 = -100 (overage)
		usage: 300,
	});

	// Workflows: allocated feature, usage carries over on migration
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		includedUsage: 5,
		balance: -10, // 5 - 15 = -10 (overage, carried over)
		usage: 15,
	});
});
