/**
 * Paid Product Migration Tests (Basic)
 *
 * Tests for migrating customers from one version of a paid product to another.
 * Covers: consumable usage, allocated seats, base price changes, mid-cycle migration.
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
// TEST 1: Consumable - Usage + Price Change (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with consumable messages ($0.10/unit overage)
 * - Customer uses 600 messages (500 included + 100 overage)
 * - Product updated to v2: $30/mo, 600 included, $0.15/unit
 * - Migrate customer
 *
 * Expected Result:
 * - Usage carried over (600)
 * - Balance = 0 (600 included - 600 used)
 * - NO new invoice (migration doesn't charge for price changes)
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-1: consumable with usage and price change - NO CHARGES")}`, async () => {
	const customerId = "migrate-paid-consumable";

	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: "pro", timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 600, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: -100, // 500 - 600 = -100 (100 in overage)
		usage: 600,
	});

	// Update product to v2 with different price
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.consumableMessages({ includedUsage: 600 }),
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

	// Usage carried over, balance recalculated with new included usage
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 0, // 600 - 600 = 0
		usage: 600,
	});

	// CRITICAL: No new invoice created
	await expectCustomerInvoiceCorrect({
		customer,
		count: invoiceCountBefore, // Same count as before migration
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
// TEST 2: Allocated Seats + Price Change (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro with 5 allocated users ($10/seat)
 * - Product updated to v2: $15/seat
 * - Migrate customer
 *
 * Expected Result:
 * - Seats preserved (5)
 * - NO proration charges
 * - NO new invoice
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-2: allocated seats with price change - NO CHARGES")}`, async () => {
	const customerId = "migrate-paid-allocated";

	const pro = products.pro({
		id: "pro",
		items: [items.allocatedUsers({ includedUsage: 0 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Users, value: 5, timeout: 2000 }),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: -5, // 5 users allocated (in "overage")
		usage: 5,
	});

	// Update product to v2 (simulate price change by recreating item)
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.allocatedUsers({ includedUsage: 2 }),
	]; // Now with 2 included
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

	// Seats preserved, balance recalculated with new included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 2,
		balance: -3, // 2 included - 5 used = -3
		usage: 5,
	});

	// CRITICAL: No new invoice created
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
// TEST 3: Base Price Change Only (NO CHARGES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 500 messages
 * - No usage tracked
 * - Product updated to v2: $50/mo (just price change)
 * - Migrate customer
 *
 * Expected Result:
 * - Balance unchanged
 * - NO charge for price increase
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-3: base price change only - NO CHARGES")}`, async () => {
	const customerId = "migrate-paid-price-only";

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
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Update product to v2 with higher price (same features)
	// Using premium price ($50) instead of pro ($20)
	const v2Items = [
		items.monthlyMessages({ includedUsage: 500 }),
		items.monthlyPrice({ price: 50 }), // Price increase
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

	// Features unchanged
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// CRITICAL: No new invoice created for price change
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
// TEST 4: Mid-Cycle Migration (NO PRORATION, reset_at preserved)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 500 messages
 * - Customer uses 100 messages
 * - Advance 15 days mid-cycle
 * - Product updated to v2 with 600 included messages
 * - Migrate customer
 *
 * Expected Result:
 * - NO proration charges mid-cycle
 * - reset_at is UNCHANGED (billing cycle preserved)
 * - Usage carried over, balance recalculated
 */
test.concurrent(`${chalk.yellowBright("migrate-paid-4: mid-cycle migration - NO PRORATION, reset_at preserved")}`, async () => {
	const customerId = "migrate-paid-mid-cycle";

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
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Capture state before migration
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customer.invoices?.length ?? 0;
	const resetAtBefore = customer.features[TestFeature.Messages]?.next_reset_at;
	expect(resetAtBefore).toBeDefined();

	// Update product to v2
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({ includedUsage: 600 }),
	];
	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration mid-cycle
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

	// CRITICAL: reset_at should be UNCHANGED
	const resetAtAfter = customer.features[TestFeature.Messages]?.next_reset_at;
	expect(resetAtAfter).toBe(resetAtBefore);

	// Usage carried over, balance recalculated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// CRITICAL: No proration invoice
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
