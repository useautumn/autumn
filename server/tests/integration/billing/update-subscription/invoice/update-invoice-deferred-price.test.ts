import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Invoice Mode Tests - Deferred Plan Activation: Price & Quantity Changes
 *
 * - Case 1: Increase price (finalized, deferred) — browser checkout
 * - Case 2: Decrease price (finalized, deferred) — auto-paid (negative total)
 * - Case 5: Increase quantity (finalized, deferred) — verify only (no payment)
 * - Case 6: Increase price (draft, deferred) — browser checkout
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
		invoice: expect.objectContaining({
			status: "open",
			stripe_id: expect.any(String),
			total: preview.total,
			hosted_invoice_url: expect.any(String),
		}),
	});
	expect(clonedResult.required_action).toBeUndefined();

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
		url: result.payment_url!,
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
	expect(clonedResult.required_action).toBeUndefined();

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
		result.invoice!.stripe_id,
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

	// Before payment - balance should still be 10 * billingUnits (original quantity)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 10 * billingUnits,
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

	// Increase price from $20 to $30 AND messages from 100 to 200
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newMessagesItem, newPriceItem],
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
		result.invoice!.stripe_id,
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

	// Before payment - balance should still be 100 (original)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

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
		productId: pro.id,
	});

	// After payment - balance should be 200 (new plan)
	expectCustomerFeatureCorrect({
		customer: customerAfterPayment,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPayment,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
