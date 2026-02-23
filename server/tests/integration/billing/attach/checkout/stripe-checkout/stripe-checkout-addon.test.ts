/**
 * Stripe Checkout Add-on Tests (Attach V2)
 *
 * Tests for add-on purchase via Stripe Checkout when customer has NO payment method.
 * Crucial tests to verify add-ons can be successfully purchased through checkout flow.
 *
 * Key behaviors:
 * - No payment method → triggers stripe_checkout mode
 * - Returns payment_url for add-on purchase
 * - After checkout completion: add-on is attached, main product remains
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
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: One-off add-on to free customer (no payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product, NO payment method
 * - Attach one-off add-on ($10 base + prepaid)
 *
 * Expected:
 * - Returns payment_url (Stripe Checkout)
 * - After checkout: both products active, add-on features available
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 1: one-off addon to free (no PM)")}`, async () => {
	const customerId = "stripe-checkout-oneoff-addon-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const oneOffWordsItem = items.oneOffWords({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffAddon = products.oneOffAddOn({
		id: "oneoff-addon",
		items: [oneOffWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [free, oneOffAddon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Verify free is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: free.id });

	// Preview add-on - $10 base + $10 for 100 words = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Words, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	// Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Words, quantity: 100 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// Verify both products are now active
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free.id, oneOffAddon.id],
	});

	// Messages from free
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Words from one-off add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
		usage: 0,
	});

	// 1 invoice for add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Recurring add-on to free customer (no payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product, NO payment method
 * - Attach recurring add-on ($20/mo)
 *
 * Expected:
 * - Returns payment_url (Stripe Checkout)
 * - After checkout: both products active, subscription created for add-on
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 2: recurring addon to free (no PM)")}`, async () => {
	const customerId = "stripe-checkout-recurring-addon-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [free, recurringAddon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Verify free is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: free.id });

	// Preview add-on - $20/mo
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: recurringAddon.id,
	});
	expect(preview.total).toBe(20);

	// Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: recurringAddon.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// Verify both products are now active
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free.id, recurringAddon.id],
	});

	// Messages from free
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Words from recurring add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 1 invoice for add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	// Verify subscription was created
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Recurring add-on to pro (purchased via checkout, then add-on)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer, no payment method
 * - Purchase Pro via checkout
 * - Then attach recurring add-on (PM should be saved from first checkout)
 *
 * Expected:
 * - First attach returns payment_url for Pro
 * - Second attach (add-on) uses saved PM, no checkout needed
 * - Both products active on same subscription
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 3: pro via checkout then recurring addon")}`, async () => {
	const customerId = "stripe-checkout-pro-then-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro, recurringAddon] }),
		],
		actions: [],
	});

	// 1. Attach Pro - should return payment_url (no PM)
	const proResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(proResult.payment_url).toBeDefined();
	expect(proResult.payment_url).toContain("checkout.stripe.com");

	// Complete checkout for Pro
	await completeStripeCheckoutForm({ url: proResult.payment_url });
	await timeout(12000);

	// Verify Pro is attached
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	// 2. Attach recurring add-on - PM should be saved, no checkout needed
	const addonResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: recurringAddon.id,
		redirect_mode: "if_required",
	});

	// Should NOT return payment_url (PM was saved from first checkout)
	expect(addonResult.payment_url).toBeFalsy();

	// Verify both products are now active
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, recurringAddon.id],
	});

	// Messages from Pro
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Words from recurring add-on
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// 2 invoices: Pro ($20) + add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	// Verify subscription has both products
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
