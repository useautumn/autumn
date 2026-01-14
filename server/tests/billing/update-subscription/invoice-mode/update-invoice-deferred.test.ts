import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Mode Tests - Deferred Plan Activation
 *
 * These tests verify invoice mode with deferred plan activation:
 * - invoice: true
 * - enable_product_immediately: false (plan activates after payment)
 * - finalize_invoice: true (invoice is finalized and sent)
 *
 * Cases:
 * - Case 1: Increase price (finalized, deferred)
 * - Case 2: Decrease price (finalized, deferred)
 * - Case 3: Free → paid (finalized, deferred)
 * - Case 4: Trial removal (finalized, deferred)
 * - Case 5: Increase quantity (finalized, deferred)
 * - Case 6: Increase price (draft, deferred) - finalize_invoice: false
 * - Case 7: Free → paid (draft, deferred) - finalize_invoice: false
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: INCREASE PRICE - FINALIZED INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: increase price (finalized, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-increase-fin",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Increase price from $20 to $30 AND increase messages from 100 to 200
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult).toMatchObject({
		payment_url: expect.any(String),
		invoice: {
			status: "open",
			stripe_id: expect.any(String),
			total: preview.total,
			hosted_invoice_url: expect.any(String),
		},
		action_required: undefined,
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "open",
	});

	// Before payment - balance should still be 100 (original)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await completeInvoiceCheckout({
		url: result.payment_url,
	});

	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterPayment,
		productId: pro.id,
	});

	// After payment - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterPayment,
		featureId: TestFeature.Messages,
		balance: 200,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: DECREASE PRICE - FINALIZED INVOICE, DEFERRED ACTIVATION
// Note: Invoice is auto-paid by Stripe because the total is negative (credit)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: decrease price (finalized, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-decrease-fin",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Decrease price from $30 to $20 AND increase messages from 100 to 200
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be -$10 credit (price decrease)
	expect(preview.total).toEqual(-10);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult).toMatchObject({
		payment_url: null,
		invoice: expect.objectContaining({
			status: "paid",
			stripe_id: expect.any(String),
			total: preview.total,
			hosted_invoice_url: expect.any(String),
		}),
	});
	expect(clonedResult.action_required).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "paid",
	});

	// After auto-paid invoice - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: FREE → PAID - FINALIZED INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: free → paid (finalized, deferred)")}`, async () => {
	const dashboardItem = items.dashboard();
	const freeProduct = products.base({
		id: "free",
		items: [dashboardItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-free-paid-fin",
		setup: [
			s.customer({ paymentMethod: "success" }),
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
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 (full price for new paid plan)
	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult).toMatchObject({
		payment_url: expect.any(String),
		invoice: expect.objectContaining({
			status: "open",
			stripe_id: expect.any(String),
			total: preview.total,
			hosted_invoice_url: expect.any(String),
		}),
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only the update invoice (free attach has no invoice)
		latestTotal: preview.total,
		latestStatus: "open",
	});

	// Before payment - messages feature should not exist (free product)
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceCheckout({
		url: result.payment_url,
	});

	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterPayment,
		productId: freeProduct.id,
	});

	// After payment - balance should be 100 (new paid plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterPayment,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterPayment,
		count: 1, // Only the update invoice (free attach has no invoice)
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: TRIAL REMOVAL - FINALIZED INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: remove trial (finalized, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-trial-fin",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Remove trial by passing free_trial: null
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price ($20) since trial is being removed
	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult.invoice).toBeDefined();
	expect(clonedResult.invoice).toMatchObject({
		status: "open",
		stripe_id: expect.any(String),
		total: preview.total,
		hosted_invoice_url: expect.any(String),
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial trial attach ($0) + update
		latestTotal: preview.total,
		latestStatus: "open",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 5: INCREASE QUANTITY - FINALIZED INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: increase quantity (finalized, deferred)")}`, async () => {
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
		customerId: "inv-def-qty-fin",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	// Preview the upgrade
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for +10 units (10 * $8 = $80)
	expect(preview.total).toBe(10 * pricePerUnit);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult.invoice).toBeDefined();
	expect(clonedResult.invoice).toMatchObject({
		status: "open",
		stripe_id: expect.any(String),
		total: preview.total,
		hosted_invoice_url: expect.any(String),
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "open",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 6: INCREASE PRICE - DRAFT INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: increase price (draft, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-increase-draft",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Increase price from $20 to $30
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: false,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult.invoice).toBeDefined();
	expect(clonedResult.invoice).toMatchObject({
		status: "draft",
		stripe_id: expect.any(String),
		total: preview.total,
		hosted_invoice_url: null,
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "draft",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 7: FREE → PAID - DRAFT INVOICE, DEFERRED ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-deferred: free → paid (draft, deferred)")}`, async () => {
	const dashboardItem = items.dashboard();
	const freeProduct = products.base({
		id: "free",
		items: [dashboardItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-def-free-paid-draft",
		setup: [
			s.customer({ paymentMethod: "success" }),
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
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: false,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 (full price for new paid plan)
	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult.invoice).toBeDefined();
	expect(clonedResult.invoice).toMatchObject({
		status: "draft",
		stripe_id: expect.any(String),
		total: preview.total,
		hosted_invoice_url: null,
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only the update invoice (free attach has no invoice)
		latestTotal: preview.total,
		latestStatus: "draft",
	});
});
