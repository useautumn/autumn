/**
 * Attach Invoice Mode Tests - Draft + Deferred
 *
 * Tests for invoice mode with:
 * - invoice: true
 * - finalize_invoice: false (draft invoice)
 * - enable_product_immediately: false (product waits for payment)
 *
 * Use case: Merchant wants to review invoice, and product should only activate after payment.
 * Note: Draft invoices can't be paid directly - they need to be finalized first.
 *
 * Scenarios:
 * 1. New plan (no product → pro)
 * 2. Upgrade (pro → premium)
 * 3. One-off credits purchase
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type AttachParamsV0, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New plan (draft, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach pro with invoice mode (draft, deferred)
 *
 * Expected Result:
 * - Draft invoice created
 * - Product NOT activated (deferred)
 * - After finalizing and paying: product activates
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-def 1: new plan")}`, async () => {
	const customerId = "attach-inv-draft-def-new-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// After initScenario, pro.id is mutated to include the prefix

	// Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// Attach with invoice mode (draft, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeNull(); // Draft invoices don't have hosted URL

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - product should NOT be activated (deferred)
	// Messages feature should not exist yet
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Verify invoice status in customer
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "draft",
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

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - product should be active
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Verify balance is correct
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice is now paid
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade (draft, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer starts on pro trial ($20/mo, 7-day trial, no card required)
 * - Advance 3 days into the trial
 * - Upgrade to premium ($50/mo) with invoice mode (draft, deferred)
 *
 * Expected Result:
 * - Draft invoice for full premium amount (trial ends on upgrade)
 * - Pro trial stays active until invoice is paid
 * - After payment: premium active and invoice paid
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-def 2: upgrade")}`, async () => {
	const customerId = "attach-inv-draft-def-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 12 }),
		],
	});

	const customerDuringTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerDuringTrial,
		active: [proTrial.id],
		notPresent: [premium.id],
	});

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});

	// Attach premium with invoice mode (draft, deferred)
	const result = await autumnV1.billing.attach<AttachParamsV0>({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBeLessThanOrEqual(preview.total + 0.01);
	expect(result.invoice!.total).toBeGreaterThanOrEqual(preview.total - 0.01);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerBefore,
		active: [proTrial.id],
		notPresent: [premium.id],
	});

	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 3,
		latestTotal: preview.total,
		latestStatus: "open",
	});

	// Complete payment
	await completeInvoiceCheckout({
		url: result.invoice!.hosted_invoice_url!,
	});

	const paidInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(paidInvoice.status).toBe("paid");

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - premium active, pro removed
	await expectCustomerProducts({
		customer: customerAfter,
		active: [premium.id],
		notPresent: [proTrial.id],
	});

	// Verify balance is premium's balance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: New plan without payment method (draft, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no payment method
 * - Attach pro with invoice mode (draft, deferred)
 *
 * Expected Result:
 * - Draft invoice created
 * - payment_url is NOT defined (draft invoice)
 * - Product NOT activated (deferred)
 * - After finalizing and paying: product activates
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-def 3: new plan no pm")}`, async () => {
	const customerId = "attach-inv-draft-def-new-plan-no-pm";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// Attach with invoice mode (draft, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeNull(); // Draft invoices don't have hosted URL

	// payment_url should NOT be defined for draft invoices
	expect(result.payment_url).toBeNull();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - product should NOT be activated (deferred)
	// Messages feature should not exist yet
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Verify invoice status in customer
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "draft",
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

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - product should be active
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Verify balance is correct
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice is now paid
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off (draft, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach one-off credits with invoice mode (draft, deferred)
 *
 * Expected Result:
 * - Draft invoice created
 * - Credits NOT granted until payment
 * - After payment: credits granted
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-def 4: one-off")}`, async () => {
	const customerId = "attach-inv-draft-def-oneoff";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-credits",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// After initScenario, oneOff.id is mutated to include the prefix

	// Preview attach - base ($10) + prepaid ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	// Attach with invoice mode (draft, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - credits should NOT be granted
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Finalize the invoice
	const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
		result.invoice!.stripe_id,
	);
	expect(finalizedInvoice.status).toBe("open");

	// Complete payment
	await completeInvoiceCheckout({
		url: finalizedInvoice.hosted_invoice_url!,
	});

	await timeout(10000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - product active and credits granted
	await expectProductActive({
		customer: customerAfter,
		productId: oneOff.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify invoice is paid
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
