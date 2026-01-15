import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { completeInvoiceConfirmation } from "@tests/utils/stripeUtils/completeInvoiceConfirmation";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Action Required Tests - Scenarios
 *
 * These tests mirror the deferred activation scenarios but with 3DS authentication required.
 * Unlike invoice mode (invoice: true), these use the default payment flow that triggers
 * action_required when 3DS is needed.
 *
 * Cases:
 * - Case 1: Increase price (action required)
 * - Case 2: Decrease price - auto-paid (no action required, negative invoice)
 * - Case 3: Free → paid (action required)
 * - Case 4: Trial removal (action required)
 * - Case 5: Increase quantity (action required)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: INCREASE PRICE - ACTION REQUIRED
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("action-required-scenario: increase price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "action-scn-increase",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS card
		],
	});

	// Increase price from $20 to $30 AND increase messages from 100 to 200
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before authentication - balance should still be 100 (original)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: pro.id,
	});

	// After authentication - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: DECREASE PRICE - AUTO-PAID (NO ACTION REQUIRED)
// Note: Invoice is auto-paid by Stripe because the total is negative (credit)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("action-required-scenario: decrease price (auto-paid)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "action-scn-decrease",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS card (but won't matter)
		],
	});

	// Decrease price from $30 to $20 AND increase messages from 100 to 200
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be -$10 credit (price decrease)
	expect(preview.total).toEqual(-10);

	const result = await autumnV1.subscriptions.update(updateParams);

	// Should NOT require action - negative invoice auto-pays
	expect(result.required_action).toBeUndefined();
	expect(result.payment_url).toBeNull();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After auto-paid invoice - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: FREE → PAID - ACTION REQUIRED
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("action-required-scenario: free → paid")}`, async () => {
	const dashboardItem = items.dashboard();
	const freeProduct = products.base({
		id: "free",
		items: [dashboardItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "action-scn-free-paid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "authenticate" }), // Start with 3DS card
			s.products({ list: [freeProduct] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	// Update from free to paid with monthly price
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [dashboardItem, messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 (full price for new paid plan)
	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before authentication - messages feature should not exist (free product)
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: freeProduct.id,
	});

	// After authentication - balance should be 100 (new paid plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 1, // Only the update invoice (free attach has no invoice)
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: TRIAL REMOVAL - ACTION REQUIRED
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("action-required-scenario: remove trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "action-scn-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS card
		],
	});

	// Remove trial by passing free_trial: null
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price ($20) since trial is being removed
	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before authentication - balance should be 100 (trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: proTrial.id,
	});

	// After authentication - balance should still be 100 (now paid, no longer trial)
	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 2, // Initial trial attach ($0) + update
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 5: INCREASE QUANTITY - ACTION REQUIRED
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("action-required-scenario: increase quantity")}`, async () => {
	const billingUnits = 12;
	const pricePerUnit = 8;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "action-scn-qty",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.attachPaymentMethod({ type: "authenticate" }), // Switch to 3DS card
		],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	};

	// Preview the upgrade
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for +10 units (10 * $8 = $80)
	expect(preview.total).toBe(10 * pricePerUnit);

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before authentication - balance should still be 10 * billingUnits (original quantity)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 10 * billingUnits,
	});

	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: product.id,
	});

	// After authentication - balance should be 20 * billingUnits (new quantity)
	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 20 * billingUnits,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
