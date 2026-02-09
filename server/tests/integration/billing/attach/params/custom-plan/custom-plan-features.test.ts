/**
 * Custom Plan Features Tests (Attach V2)
 *
 * Tests for the `items` parameter in billing.attach that allows
 * overriding product configuration at attach time.
 *
 * Key behaviors:
 * - Adding/removing/changing base prices
 * - Adding/removing features
 * - Changing included usage
 * - Changing price configurations (consumable, prepaid)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// BASE PRICE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Add base price to free product
 *
 * Scenario:
 * - Free product has only messages (no price)
 * - Attach with items that add a monthly base price
 *
 * Expected:
 * - Customer charged $20
 * - Stripe subscription created
 * - Features remain available
 */
test.concurrent(`${chalk.yellowBright("custom-plan 1: add base price to free product")}`, async () => {
	const customerId = "custom-plan-add-base-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [],
	});

	// Attach with custom items that add a base price
	const priceItem = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: free.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 2: Increase base price on attach
 *
 * Scenario:
 * - Pro product has $20/mo base price
 * - Attach with items that increase price to $30
 *
 * Expected:
 * - Customer charged $30 (not $20)
 * - Subscription at new price
 */
test.concurrent(`${chalk.yellowBright("custom-plan 2: increase base price on attach")}`, async () => {
	const customerId = "custom-plan-increase-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom items that increase price
	const higherPriceItem = items.monthlyPrice({ price: 30 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPriceItem],
	});

	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPriceItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 3: Remove base price from paid product
 *
 * Scenario:
 * - Pro product has $20/mo base price
 * - Attach with items that remove the price (only features)
 *
 * Expected:
 * - No charge
 * - No Stripe subscription
 * - Features still available (free product)
 */
test.concurrent(`${chalk.yellowBright("custom-plan 3: remove base price from paid product")}`, async () => {
	const customerId = "custom-plan-remove-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom items that remove the price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem], // No price item
	});

	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem], // No price item
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 4: Add feature on attach
 *
 * Scenario:
 * - Pro product has only messages
 * - Attach with items that add dashboard feature
 *
 * Expected:
 * - Both messages and dashboard available
 * - Price unchanged
 */
test.concurrent(`${chalk.yellowBright("custom-plan 4: add feature on attach")}`, async () => {
	const customerId = "custom-plan-add-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom items that add dashboard
	const dashboardItem = items.dashboard();

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem, dashboardItem],
	});

	expect(preview.total).toBe(20); // Price unchanged

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem, dashboardItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// Messages available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Dashboard available (boolean feature)
	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 5: Remove feature on attach
 *
 * Scenario:
 * - Pro product has messages + dashboard
 * - Attach with items that remove dashboard
 *
 * Expected:
 * - Only messages available
 * - Dashboard not available
 */
test.concurrent(`${chalk.yellowBright("custom-plan 5: remove feature on attach")}`, async () => {
	const customerId = "custom-plan-remove-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const dashboardItem = items.dashboard();
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, dashboardItem, priceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom items that remove dashboard
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem], // No dashboard
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem], // No dashboard
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// Messages available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Dashboard NOT available
	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 6: Change included usage on attach
 *
 * Scenario:
 * - Pro product has 100 messages included
 * - Attach with items that increase to 500 messages
 *
 * Expected:
 * - 500 messages included
 * - Balance is 500
 */
test.concurrent(`${chalk.yellowBright("custom-plan 6: change included usage on attach")}`, async () => {
	const customerId = "custom-plan-change-usage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom items that increase included usage
	const higherUsageItem = items.monthlyMessages({ includedUsage: 500 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [higherUsageItem, priceItem],
	});

	expect(preview.total).toBe(20); // Price unchanged

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [higherUsageItem, priceItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// 500 messages included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE CONFIGURATION CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 7: Add consumable overage price
 *
 * Scenario:
 * - Pro product has free messages (100 included, no overage)
 * - Attach with consumable that has overage pricing
 *
 * Expected:
 * - 100 messages included
 * - Overage billing enabled after 100
 */
test.concurrent(`${chalk.yellowBright("custom-plan 7: add consumable overage price")}`, async () => {
	const customerId = "custom-plan-add-overage";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with consumable that has overage pricing ($0.10/message after 100)
	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
	});

	expect(preview.total).toBe(20); // Base price only

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// 100 messages included with consumable overage
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 8: Change prepaid price
 *
 * Scenario:
 * - Pro product has prepaid at $10/100 messages
 * - Attach with prepaid at $15/100 messages
 *
 * Expected:
 * - Customer charged at new price ($15/100)
 */
test.concurrent(`${chalk.yellowBright("custom-plan 8: change prepaid price")}`, async () => {
	const customerId = "custom-plan-change-prepaid";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with custom prepaid at higher price
	const higherPricePrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});

	const quantity = 200; // 2 packs

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [higherPricePrepaid],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	// 2 packs * $15 = $30
	expect(preview.total).toBe(30);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [higherPricePrepaid],
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// 200 messages (2 packs)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
