/**
 * Custom Plan Add-on Tests (Attach V2)
 *
 * Tests for the `items` parameter in billing.attach when attaching add-ons
 * with custom configuration.
 *
 * Key behaviors:
 * - Free add-on becoming paid
 * - Paid add-on becoming free
 * - Recurring add-on to one-off
 * - Changing add-on feature quantity
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ON CUSTOM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Free add-on becomes paid
 *
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Free add-on (words feature, no price)
 * - Attach add-on with custom price $10/mo
 *
 * Expected:
 * - Add-on charged $10/mo
 * - Both Pro and add-on active
 * - Words feature available
 */
test.concurrent(`${chalk.yellowBright("custom-plan-addon 1: free addon becomes paid")}`, async () => {
	const customerId = "custom-plan-addon-free-to-paid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Free add-on (no price)
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.base({
		id: "addon",
		items: [wordsItem],
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	// Attach add-on with custom price $10/mo
	const addonPrice = items.monthlyPrice({ price: 10 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
	});

	expect(preview.total).toBe(10);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, addonPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both Pro and add-on active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// Messages from Pro
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Words from add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + add-on ($10)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
 * Test 2: Paid add-on becomes free
 *
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Paid add-on ($20/mo with words feature)
 * - Attach add-on with custom items (no price)
 *
 * Expected:
 * - Add-on free (no charge)
 * - Words feature available
 */
test.concurrent(`${chalk.yellowBright("custom-plan-addon 2: paid addon becomes free")}`, async () => {
	const customerId = "custom-plan-addon-paid-to-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Paid add-on ($20/mo from recurringAddOn)
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify customer is on Pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	// Attach add-on with no price (make it free)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem], // No price item
	});

	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem], // No price item
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both Pro and add-on active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// Words from add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Only 1 invoice: Pro ($20), no add-on charge
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
 * Test 3: Recurring add-on to one-off
 *
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Recurring add-on ($20/mo)
 * - Attach add-on with one-off price ($50)
 *
 * Expected:
 * - One-time $50 charge for add-on
 * - Words feature available
 */
test.concurrent(`${chalk.yellowBright("custom-plan-addon 3: recurring addon to one-off")}`, async () => {
	const customerId = "custom-plan-addon-recurring-to-oneoff";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Recurring add-on ($20/mo)
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Attach add-on with one-off price
	const oneOffPrice = constructPriceItem({ price: 50, interval: null });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, oneOffPrice],
	});

	expect(preview.total).toBe(50);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [wordsItem, oneOffPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both Pro and add-on active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// Words from add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + add-on one-off ($50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Test 4: Change add-on feature quantity
 *
 * Scenario:
 * - Customer on Pro ($20/mo)
 * - Add-on has 100 words
 * - Attach add-on with custom items (500 words)
 *
 * Expected:
 * - 500 words included (instead of 100)
 */
test.concurrent(`${chalk.yellowBright("custom-plan-addon 4: change addon feature quantity")}`, async () => {
	const customerId = "custom-plan-addon-change-quantity";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	// Add-on with 100 words
	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const addon = products.recurringAddOn({ id: "addon", items: [wordsItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Attach add-on with increased words (500 instead of 100)
	const moreWordsItem = items.monthlyWords({ includedUsage: 500 });
	const addonPrice = items.monthlyPrice({ price: 20 });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		items: [moreWordsItem, addonPrice],
	});

	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		items: [moreWordsItem, addonPrice],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both Pro and add-on active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	// Words from add-on - should be 500, not 100
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
