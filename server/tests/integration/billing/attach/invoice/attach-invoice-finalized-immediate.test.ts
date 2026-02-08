/**
 * Attach Invoice Mode Tests - Finalized + Immediate
 *
 * Tests for invoice mode with:
 * - invoice: true
 * - finalize_invoice: true (invoice is finalized/open)
 * - enable_product_immediately: true (default - product activates immediately)
 *
 * Use case: B2B scenario where invoice is sent for payment, but product access is granted immediately.
 * Common for enterprise customers with payment terms (NET 30, etc.)
 *
 * Scenarios:
 * 1. New plan (no product → pro)
 * 2. Upgrade (pro → premium)
 * 3. Downgrade (premium → pro, scheduled)
 * 4. One-off credits purchase
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New plan (finalized, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach pro with invoice mode (finalized, immediate)
 *
 * Expected Result:
 * - Open invoice created (with hosted_invoice_url)
 * - Product activated immediately
 * - Balance correct
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-imm 1: new plan")}`, async () => {
	const customerId = "attach-inv-fin-imm-new-plan";

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

	// Attach with invoice mode (finalized, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is open (finalized)
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();

	// Verify Stripe invoice is open
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);
	expect(stripeInvoice.hosted_invoice_url).toBeTruthy();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active (immediate activation)
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify balance is correct
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice status in customer
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "open",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade (finalized, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with invoice mode
 *
 * Expected Result:
 * - Open invoice for prorated difference
 * - Product switched immediately
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-imm 2: upgrade")}`, async () => {
	const customerId = "attach-inv-fin-imm-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx: testCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// After initScenario, pro.id and premium.id are mutated to include the prefix

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(30); // $50 - $20

	// Attach premium with invoice mode (finalized, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states - premium active, pro removed
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance is premium's balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify invoices: pro ($20 paid) + upgrade ($30 open)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "open",
	});

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: testCtx.db,
		customerId,
		org: testCtx.org,
		env: testCtx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade (finalized, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with invoice mode
 *
 * Expected Result:
 * - Invoice total = $0 (downgrade is scheduled)
 * - Premium is canceling, pro is scheduled
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-imm 3: downgrade")}`, async () => {
	const customerId = "attach-inv-fin-imm-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const {
		autumnV1,
		ctx: testCtx,
		advancedTo,
	} = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "premium" })],
	});

	// After initScenario, pro.id and premium.id are mutated to include the prefix

	// Preview downgrade - should be $0 (scheduled)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 20,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	// Attach pro with invoice mode (finalized, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// invoice and payment url are NOT returned in downgrade cases
	expect(result.invoice).toBeFalsy();
	expect(result.payment_url).toBeFalsy();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states - premium canceling, pro scheduled
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify features still have premium's balance (until cycle end)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: testCtx.db,
		customerId,
		org: testCtx.org,
		env: testCtx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off (finalized, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach one-off credits with invoice mode (finalized, immediate)
 *
 * Expected Result:
 * - Open invoice created
 * - Credits granted immediately
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-imm 4: one-off")}`, async () => {
	const customerId = "attach-inv-fin-imm-oneoff";

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

	// Attach with invoice mode (finalized, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: oneOff.id,
	});

	// Verify credits granted immediately
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "open",
	});
});
