/**
 * Paid Product Migration Tests (Feature Changes)
 *
 * Tests for migrating customers when features are added, removed, or billing model changes.
 * Covers: feature added, feature removed, prepaid → pay per use conversion.
 * CRITICAL: Migrations should NEVER create new charges or invoices.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForMigration = (ms = 20000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Feature Added in V2 (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with messages only
 * - Product updated to v2: adds words feature
 * - Migrate customer
 *
 * Expected Result:
 * - Messages usage preserved
 * - Words feature added with full balance
 * - NO charges
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-6: feature added in v2 - NO CHARGES")}`, async () => {
	const customerId = "migrate-paid-feature-added";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: "pro", timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	// Update product to v2 with additional words feature
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({ includedUsage: 500 }),
		items.monthlyWords({ includedUsage: 200 }),
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

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});

	// Words feature added with full balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// CRITICAL: No new invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Feature Removed in V2 (Customer Loses Access)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with messages + words
 * - Product updated to v2: words feature removed
 * - Migrate customer
 *
 * Expected Result:
 * - Messages preserved
 * - Words feature removed (customer loses access)
 * - NO charges
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-7: feature removed in v2 - customer loses access")}`, async () => {
	const customerId = "migrate-paid-feature-removed";

	const pro = products.pro({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyWords({ includedUsage: 200 }),
		],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: "pro", timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.track({ featureId: TestFeature.Words, value: 50, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 150,
		usage: 50,
	});

	// Update product to v2 without words feature
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({ includedUsage: 500 }),
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

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 400,
		usage: 100,
	});

	// Words feature should be gone
	expect(customer.features[TestFeature.Words]).toBeUndefined();

	// CRITICAL: No new invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Prepaid → Pay Per Use (Quantity Preserved, NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid users (3 purchased)
 * - Product updated to v2: pay per use users
 * - Migrate customer
 *
 * Expected Result:
 * - User count preserved (3)
 * - NO charges for the conversion
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-8: prepaid to pay per use - quantity preserved, NO CHARGES")}`, async () => {
	const customerId = "migrate-paid-prepaid-to-ppu";

	const pro = products.pro({
		id: "pro",
		items: [items.prepaidUsers({ includedUsage: 0, billingUnits: 1 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Users, quantity: 3 }],
				timeout: 4000,
			}),
		],
	});

	// Verify initial state - 3 prepaid users
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 3, // 3 prepaid
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		},
		{
			timeout: 2000,
		},
	);

	// Update product to v2 with pay per use (allocated) users instead of prepaid
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.allocatedUsers({ includedUsage: 1 }),
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

	// Verify migrated state
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
	});

	// User count preserved - now 1 included, 3 used = -2 overage
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 1,
		balance: -2,
		usage: 3,
	});

	// CRITICAL: No new invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
