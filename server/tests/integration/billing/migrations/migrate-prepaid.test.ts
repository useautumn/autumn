/**
 * Migration Prepaid Tests
 *
 * Tests for migrating customers with prepaid features from one version to another.
 * CRITICAL: Migrations should NEVER create new charges or invoices.
 *
 * Key behaviors:
 * - Total quantity (included + purchased) carries over during migration
 * - Balance is recalculated based on new product's included_usage
 * - Billing units changes are handled (quantity preserved, packs recalculated)
 * - NO charges for any changes during migration
 */

import { test } from "bun:test";
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

const waitForMigration = (ms = 5000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid - Increase Included Usage (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid (0 included, quantity: 200)
 * - Product updated to v2: 100 included
 * - Migrate customer
 *
 * Expected Result:
 * - Balance = 200 (quantity preserved - included usage is part of quantity, not additive)
 * - NO new invoice
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-1: increase included usage - NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-inc-included";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200, // 0 included + 200 purchased
		usage: 0,
	});

	// Update product to v2 with more included usage
	// Note: products.pro() has $20/mo base price
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		}),
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

	// Balance = 200 (quantity preserved - included usage is part of quantity, not additive)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
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
// TEST 2: Prepaid - Decrease Included Usage (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid (200 included, quantity: 400)
 * - Product updated to v2: 100 included (decreased)
 * - Migrate customer
 *
 * Expected Result:
 * - Balance = 400 (quantity preserved - included usage is part of quantity, not additive)
 * - NO new invoice
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-2: decrease included usage - NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-dec-included";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 200, // 200 is a multiple of 100
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 400, // quantity: 400 (included usage is part of quantity, not additive)
		usage: 0,
	});

	// Update product to v2 with less included usage (100 is still a multiple of 100)
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 100, // decreased from 200 to 100
			billingUnits: 100,
			price: 10,
		}),
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

	// Balance = 400 (quantity preserved - included usage is part of quantity, not additive)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 400,
		usage: 0,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid - Billing Units Change (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid (200 purchased @ 100 units/pack = 2 packs)
 * - Product updated to v2: 50 units/pack (same quantity = 4 packs)
 * - Migrate customer
 *
 * Expected Result:
 * - Balance = 200 (quantity preserved)
 * - Stripe subscription has 4 packs instead of 2
 * - NO new invoice (migration doesn't charge for billing unit changes)
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-3: billing units change - NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-billing-units";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Update product to v2 with different billing units
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 50, // Changed from 100 to 50
			price: 10,
		}),
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

	// Balance = 200 (quantity preserved, even though packs changed from 2 to 4)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid with Usage - Usage Preserved (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid (0 included, quantity: 200)
 * - Customer tracks 50 usage (balance = 150)
 * - Product updated to v2: 100 included
 * - Migrate customer
 *
 * Expected Result:
 * - Usage = 50 (preserved)
 * - Balance = 200 - 50 = 150 (quantity preserved, usage preserved)
 * - NO new invoice
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-4: with usage - usage preserved, NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-with-usage";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				timeout: 4000,
			}),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150, // 200 - 50
		usage: 50,
	});

	// Update product to v2 with more included usage
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		}),
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

	// Balance = 200 - 50 = 150 (quantity preserved, usage preserved)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 50,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prepaid - Price Change (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid (200 purchased @ $10/pack = $20 prepaid)
 * - Product updated to v2: $15/pack
 * - Migrate customer
 *
 * Expected Result:
 * - Balance = 200 (quantity preserved)
 * - NO charge for price increase (migration doesn't charge)
 * - Future renewals will be at new price
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-5: price change - NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-price-change";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Update product to v2 with higher price
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 15, // Increased from $10 to $15
		}),
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

	// Balance = 200 (quantity preserved)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// CRITICAL: No new invoice created for price change
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid - All Config Changes (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with prepaid:
 *   - 0 included, quantity: 200 @ 100 units/pack @ $10/pack
 * - Product updated to v2:
 *   - 50 included, 50 units/pack @ $15/pack
 * - Migrate customer
 *
 * Expected Result:
 * - Balance = 200 (quantity preserved - included usage is part of quantity, not additive)
 * - NO charge despite billing units and price changes
 */
test.concurrent(`${chalk.yellowBright("migrate-prepaid-6: all config changes - NO CHARGES")}`, async () => {
	const customerId = "migrate-prepaid-all-changes";

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
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
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Update product to v2 with all config changes
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.prepaidMessages({
			includedUsage: 50, // Added included
			billingUnits: 50, // Changed from 100 to 50
			price: 15, // Changed from $10 to $15
		}),
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

	// Balance = 200 (quantity preserved - included usage is part of quantity, not additive)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
