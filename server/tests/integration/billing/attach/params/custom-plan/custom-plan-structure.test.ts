/**
 * Custom Plan Structure Tests (Attach V2)
 *
 * Tests for the `items` parameter in billing.attach that changes
 * the fundamental structure of the product.
 *
 * Key behaviors:
 * - Upgrade/downgrade inversion via price changes
 * - Billing type changes (recurring <-> one-off <-> free)
 * - Billing interval changes (monthly <-> annual)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// UPGRADE/DOWNGRADE INVERSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Downgrade becomes upgrade via price increase
 *
 * Scenario:
 * - Customer on Premium ($50/mo)
 * - Pro product is normally $20/mo (would be downgrade)
 * - Attach Pro with custom price $60/mo
 *
 * Expected:
 * - Treated as upgrade (immediate)
 * - Customer charged prorated difference (Premium → custom Pro)
 * - Premium replaced by Pro immediately
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 1: downgrade becomes upgrade via price increase")}`, async () => {
	const customerId = "custom-plan-downgrade-to-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({ id: "pro", items: [messagesItem, proPrice] });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Verify customer is on Premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: premium.id,
	});

	// Attach Pro with custom price $60 (higher than Premium's $50)
	const higherPrice = items.monthlyPrice({ price: 60 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPrice],
	});

	// Should be immediate charge (upgrade), $60 - $50 = $10 difference
	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, higherPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro should be active, Premium should be gone (immediate switch)
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial Premium + upgrade to Pro
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 2: Upgrade becomes downgrade via price decrease
 *
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Premium product is normally $50/mo (would be upgrade)
 * - Attach Premium with custom price $15/mo
 *
 * Expected:
 * - Treated as downgrade (scheduled)
 * - No immediate charge
 * - Pro canceling, Premium scheduled
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 2: upgrade becomes downgrade via price decrease")}`, async () => {
	const customerId = "custom-plan-upgrade-to-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({ id: "pro", items: [messagesItem, proPrice] });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	// Attach Premium with custom price $15 (lower than Pro's $20)
	const lowerPrice = items.monthlyPrice({ price: 15 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
	});

	// Should be scheduled (downgrade), no immediate charge
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 15,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		items: [messagesItem, lowerPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro should be canceling, Premium should be scheduled
	await expectProductCanceling({ customer, productId: pro.id });
	await expectProductScheduled({
		customer,
		productId: premium.id,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	// No new invoice (scheduled switch)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only initial Pro
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
// BILLING TYPE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 3: Recurring to one-off
 *
 * Scenario:
 * - Pro product is $20/mo recurring
 * - Attach with custom items that make it one-off ($50)
 *
 * Expected:
 * - One-time $50 charge
 * - No recurring subscription
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 3: recurring to one-off")}`, async () => {
	const customerId = "custom-plan-recurring-to-oneoff";

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

	// Attach with one-off price instead of recurring
	const oneOffPrice = constructPriceItem({ price: 50, interval: null });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, oneOffPrice],
	});

	expect(preview.total).toBe(50);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, oneOffPrice],
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
		latestTotal: 50,
	});

	// One-off products don't create recurring subscriptions
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 4: One-off to recurring
 *
 * Scenario:
 * - One-off product is $50 one-time
 * - Attach with custom items that make it recurring ($20/mo)
 *
 * Expected:
 * - $20 charged
 * - Recurring subscription created
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 4: one-off to recurring")}`, async () => {
	const customerId = "custom-plan-oneoff-to-recurring";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const oneOff = products.oneOff({ id: "one-off", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach with recurring price instead of one-off
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: oneOff.id });

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

	// Should have recurring subscription now
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 5: Free to recurring
 *
 * Scenario:
 * - Free product has no price
 * - Attach with custom items that add recurring price
 *
 * Expected:
 * - $20 charged
 * - Subscription created
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 5: free to recurring")}`, async () => {
	const customerId = "custom-plan-free-to-recurring";

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

	// Attach with monthly price
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: free.id });

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
 * Test 6: Recurring to free
 *
 * Scenario:
 * - Pro product is $20/mo
 * - Attach with custom items that remove the price
 *
 * Expected:
 * - No charge
 * - No subscription
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 6: recurring to free")}`, async () => {
	const customerId = "custom-plan-recurring-to-free";

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

	// Attach with no price (free)
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
// BILLING INTERVAL CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 7: Monthly to annual on attach
 *
 * Scenario:
 * - Pro product is normally $20/mo
 * - Attach with annual price $200/year
 *
 * Expected:
 * - $200 charged
 * - Annual billing cycle
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 7: monthly to annual on attach")}`, async () => {
	const customerId = "custom-plan-monthly-to-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyPrice = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, monthlyPrice] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with annual price
	const annualPrice = items.annualPrice({ price: 200 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPrice],
	});

	expect(preview.total).toBe(200);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 8: Annual to monthly on attach
 *
 * Scenario:
 * - Pro product is normally $200/year
 * - Attach with monthly price $20/mo
 *
 * Expected:
 * - $20 charged
 * - Monthly billing cycle
 */
test.concurrent(`${chalk.yellowBright("custom-plan-structure 8: annual to monthly on attach")}`, async () => {
	const customerId = "custom-plan-annual-to-monthly";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const annualPrice = items.annualPrice({ price: 200 });
	const pro = products.base({ id: "pro", items: [messagesItem, annualPrice] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with monthly price
	const monthlyPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPrice],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

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
