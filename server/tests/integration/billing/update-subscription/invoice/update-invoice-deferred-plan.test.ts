import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Mode Tests - Deferred Plan Activation: Free → Paid Transitions
 *
 * - Case 3: Free → paid (finalized, deferred) — browser checkout
 * - Case 7: Free → paid (draft, deferred) — browser checkout
 */

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
		result.invoice!.stripe_id,
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
		url: result.payment_url!,
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
		result.invoice!.stripe_id,
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

	// Before payment - features should NOT have changed yet (deferred activation)
	// Dashboard should still be accessible (original free product feature)
	expect(customer.features?.[TestFeature.Dashboard]).toBeDefined();
	// Messages feature should NOT exist yet (new paid plan feature)
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();

	// Finalize the invoice
	const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
		result.invoice!.stripe_id,
	);
	expect(finalizedInvoice.status).toBe("open");
	expect(finalizedInvoice.hosted_invoice_url).toBeDefined();

	// Complete payment
	await completeInvoiceCheckout({
		url: finalizedInvoice.hosted_invoice_url!,
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

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPayment,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
