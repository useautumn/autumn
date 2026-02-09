/**
 * Migration Add-on Tests
 *
 * Tests for migrating add-on products independently from main products.
 * Add-ons and main products should be migrated independently.
 *
 * Key behaviors:
 * - Migrating add-on only leaves main product untouched
 * - Migrating main only leaves add-ons untouched
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Migrate Add-on Only (Main Product Untouched)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro (main) + storage add-on
 * - Storage add-on updated to v2
 * - Migrate add-on only
 *
 * Expected Result:
 * - Add-on migrated to v2
 * - Main product (pro) UNTOUCHED
 */
test.concurrent(`${chalk.yellowBright("migrate-addons-1: migrate add-on only, main product untouched")}`, async () => {
	const customerId = "migrate-addon-only";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const monthlyPrice = items.monthlyPrice();
	const storageAddOn = products.base({
		id: "storage-addon",
		isAddOn: true,
		items: [monthlyPrice, items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, storageAddOn] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.billing.attach({ productId: "storage-addon" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.track({ featureId: TestFeature.Words, value: 20, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const proVersionBefore = customer.products?.find(
		(p) => p.id === pro.id,
	)?.version;

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
		balance: 80,
		usage: 20,
	});

	// Update add-on to v2
	const v2AddOnItems = [
		monthlyPrice,
		items.monthlyWords({ includedUsage: 200 }),
	];
	await autumnV1.products.update(storageAddOn.id, { items: v2AddOnItems });

	// Migrate add-on ONLY
	await autumnV1.migrate({
		from_product_id: storageAddOn.id,
		to_product_id: storageAddOn.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, storageAddOn.id],
	});

	// Main product UNTOUCHED - version same
	const proVersionAfter = customer.products?.find(
		(p) => p.id === pro.id,
	)?.version;
	expect(proVersionAfter).toBe(proVersionBefore);

	// Main product features UNTOUCHED
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});

	// Add-on features updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200, // v2 included
		balance: 180, // 200 - 20
		usage: 20,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Migrate Main Only (Add-ons Untouched)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro (main) + storage add-on
 * - Pro updated to v2
 * - Migrate main only
 *
 * Expected Result:
 * - Main product (pro) migrated to v2
 * - Add-on UNTOUCHED
 */
test.concurrent(`${chalk.yellowBright("migrate-addons-2: migrate main only, add-ons untouched")}`, async () => {
	const customerId = "migrate-main-only";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const monthlyPrice = items.monthlyPrice();
	const storageAddOn = products.base({
		id: "storage-addon",
		isAddOn: true,
		items: [monthlyPrice, items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, storageAddOn] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.billing.attach({ productId: "storage-addon" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.track({ featureId: TestFeature.Words, value: 20, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const addOnVersionBefore = customer.products?.find(
		(p) => p.id === storageAddOn.id,
	)?.version;

	// Update main product to v2
	const v2MainItems = [
		monthlyPrice,
		items.monthlyMessages({ includedUsage: 600 }),
	];
	await autumnV1.products.update(pro.id, { items: v2MainItems });

	// Migrate main ONLY
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, storageAddOn.id],
	});

	// Add-on UNTOUCHED - version same
	const addOnVersionAfter = customer.products?.find(
		(p) => p.id === storageAddOn.id,
	)?.version;
	expect(addOnVersionAfter).toBe(addOnVersionBefore);

	// Main product features updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600, // v2 included
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Add-on features UNTOUCHED
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 100,
		balance: 80,
		usage: 20,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Same Add-on Attached Twice - Both Migrated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro (main) + storage add-on attached TWICE
 * - Storage add-on updated to v2
 * - Migrate add-on
 *
 * Expected Result:
 * - BOTH instances of the add-on are migrated to v2
 * - Combined features are updated correctly
 */
test.concurrent(`${chalk.yellowBright("migrate-addons-3: same add-on attached twice - both migrated")}`, async () => {
	const customerId = "migrate-addon-twice";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// Add-on that gives 100 words each time attached
	const monthlyPrice = items.monthlyPrice({ price: 10 });
	const storageAddOn = products.base({
		id: "storage-addon",
		isAddOn: true,
		items: [monthlyPrice, items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, storageAddOn] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.billing.attach({ productId: "storage-addon" }), // First add-on
			s.billing.attach({ productId: "storage-addon", timeout: 4000 }), // Second add-on (same product)
			s.track({ featureId: TestFeature.Words, value: 50, timeout: 2000 }),
		],
	});

	// Verify initial state - should have 200 words (100 from each add-on)
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Combined included usage: 100 + 100 = 200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200, // 100 from each add-on
		balance: 150, // 200 - 50
		usage: 50,
	});

	// Update add-on to v2 with more words
	const v2AddOnItems = [
		monthlyPrice,
		items.monthlyWords({ includedUsage: 150 }), // Increased from 100 to 150
	];
	await autumnV1.products.update(storageAddOn.id, { items: v2AddOnItems });

	// Migrate add-on
	await autumnV1.migrate({
		from_product_id: storageAddOn.id,
		to_product_id: storageAddOn.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();
	await timeout(5000);

	// Verify migrated state

	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: customerId,
	});

	const addOnCusProducts = fullCustomer.customer_products.filter(
		(cp) => cp.product.id === storageAddOn.id,
	);

	expect(addOnCusProducts.length).toBe(2);
	expect(addOnCusProducts[0].product.version).toBe(2);
	expect(addOnCusProducts[1].product.version).toBe(2);

	// Combined included usage: 150 + 150 = 300 (both migrated)
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 300, // 150 from each migrated add-on
		balance: 250, // 300 - 50
		usage: 50,
	});
});
