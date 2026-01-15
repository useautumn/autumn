import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Mode Tests for Price Updates
 *
 * These tests verify invoice mode configurations when updating subscription prices:
 * - Case 1: Increase price with draft invoice, immediate entitlements
 * - Case 2: Decrease price with draft invoice, immediate entitlements
 * - Case 2B: Free → paid with draft invoice, immediate entitlements
 * - Case 3: Trial removal with draft invoice, immediate entitlements
 * - Case 4: Increase price with finalized invoice, immediate entitlements
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: INCREASE PRICE - DRAFT INVOICE, IMMEDIATE ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-mode: increase price (draft, immediate)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-increase-draft",
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
		enable_product_immediately: true,
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
// CASE 2: DECREASE PRICE - DRAFT INVOICE, IMMEDIATE ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-mode: decrease price (draft, immediate)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-decrease-draft",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Decrease price from $30 to $20
	const newPriceItem = items.monthlyPrice({ price: 20 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be $0 or credit (price decrease)
	expect(preview.total).toEqual(-10);

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
// CASE 2B: FREE → PAID - DRAFT INVOICE, IMMEDIATE ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-mode: free → paid (draft, immediate)")}`, async () => {
	const dashboardItem = items.dashboard();
	const freeProduct = products.base({
		id: "free",
		items: [dashboardItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-free-to-paid-draft",
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
		enable_product_immediately: true,
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

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: TRIAL REMOVAL - DRAFT INVOICE, IMMEDIATE ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-mode: remove trial (draft, immediate)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-remove-trial-draft",
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
		enable_product_immediately: true,
		finalize_invoice: false,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full price ($20) since trial is being removed
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
		count: 2, // Initial trial attach ($0) + update
		latestTotal: preview.total,
		latestStatus: "draft",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: INCREASE PRICE - FINALIZED INVOICE, IMMEDIATE ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("invoice-mode: increase price (finalized, immediate)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "inv-increase-finalized",
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
		enable_product_immediately: true,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

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
	expect(stripeInvoice.hosted_invoice_url).toBeTruthy();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + update
		latestTotal: preview.total,
		latestStatus: "open",
	});
});
