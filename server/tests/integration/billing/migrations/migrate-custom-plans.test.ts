/**
 * Migration Custom Plan Tests
 *
 * Tests for ensuring custom plans are SKIPPED during migration.
 * Custom plans have been manually adjusted by admins and should not be
 * automatically migrated to avoid losing those customizations.
 *
 * Key behaviors:
 * - Customers with is_custom = true are SKIPPED
 * - Batch with mix of custom and regular → only regular migrated
 */

import { expect, test } from "bun:test";
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
// TEST 1: Custom Plan Customer is SKIPPED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attached to pro with is_custom = true (custom pricing)
 * - Product updated to v2
 * - Migrate
 *
 * Expected Result:
 * - Customer is SKIPPED (not migrated)
 * - Customer still has original v1 features
 */
test.concurrent(`${chalk.yellowBright("migrate-custom-1: custom plan customer is skipped")}`, async () => {
	const customerId = "migrate-custom-skip";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// Attach with is_custom = true (custom pricing)
			s.billing.attach({
				productId: "pro",
				items: [monthlyPrice, items.monthlyMessages({ includedUsage: 750 })], // Custom included usage
			}),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	// Verify initial state - custom plan with 750 included (not 500)
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 750, // Custom value, not product's 500
		balance: 650, // 750 - 100
		usage: 100,
	});

	// Get version before migration
	const versionBefore = customer.products?.find(
		(p) => p.id === pro.id,
	)?.version;

	// Update product to v2
	const v2Items = [monthlyPrice, items.monthlyMessages({ includedUsage: 600 })];
	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify customer was SKIPPED
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
	});

	// Version should be UNCHANGED (not migrated)
	const versionAfter = customer.products?.find((p) => p.id === pro.id)?.version;
	expect(versionAfter).toBe(versionBefore);

	// Custom features should be UNCHANGED (still 750, not updated to v2's 600)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 750, // Still custom value
		balance: 650, // Unchanged
		usage: 100,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Mix of Custom and Regular - Only Regular Migrated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer A: regular pro plan
 * - Customer B: custom pro plan
 * - Product updated to v2
 * - Migrate
 *
 * Expected Result:
 * - Customer A: migrated to v2
 * - Customer B: SKIPPED (still on v1 with custom features)
 */
test.concurrent(`${chalk.yellowBright("migrate-custom-2: mix of custom and regular - only regular migrated")}`, async () => {
	const customerIdRegular = "migrate-custom-regular";
	const customerIdCustom = "migrate-custom-custom";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// Setup both customers in a single initScenario
	const { autumnV1 } = await initScenario({
		customerId: customerIdRegular,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: customerIdCustom, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [
			// Regular customer attaches with standard product config
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			// Custom customer attaches with custom items (overridden pricing)
			s.billing.attach({
				productId: "pro",
				customerId: customerIdCustom,
				items: [
					items.monthlyPrice({ price: 20 }),
					items.monthlyMessages({ includedUsage: 800 }),
				],
			}),
		],
	});

	// Track usage for custom customer (s.track doesn't support customerId override)
	await autumnV1.track({
		customer_id: customerIdCustom,
		feature_id: TestFeature.Messages,
		value: 100,
	});
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify initial states
	let regularCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerIdRegular);
	let customCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerIdCustom);

	expectCustomerFeatureCorrect({
		customer: regularCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 450,
		usage: 50,
	});

	expectCustomerFeatureCorrect({
		customer: customCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 800, // Custom
		balance: 700,
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

	await waitForMigration();

	// Verify regular customer was MIGRATED
	regularCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerIdRegular);
	expectCustomerFeatureCorrect({
		customer: regularCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 600, // Updated to v2
		balance: 550, // 600 - 50
		usage: 50,
	});

	// Verify custom customer was SKIPPED
	customCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerIdCustom);
	expectCustomerFeatureCorrect({
		customer: customCustomer,
		featureId: TestFeature.Messages,
		includedUsage: 800, // Still custom
		balance: 700, // Unchanged
		usage: 100,
	});
});
