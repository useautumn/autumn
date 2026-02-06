/**
 * Attach Invoice Mode Tests - Draft + Immediate
 *
 * Tests for invoice mode with:
 * - invoice: true
 * - finalize_invoice: false (draft invoice)
 * - enable_product_immediately: true (default - product activates immediately)
 *
 * Use case: Merchant wants to review invoice before finalizing, but product activates immediately.
 *
 * Scenarios:
 * 1. New plan (no product → pro)
 * 2. Upgrade (pro → premium)
 * 3. Downgrade (premium → pro, scheduled)
 * 4. One-off credits purchase
 * 5. One-off on existing subscription
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
// TEST 1: New plan (draft, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach pro with invoice mode (draft, immediate)
 *
 * Expected Result:
 * - Draft invoice created
 * - Product activated immediately
 * - Balance correct
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-imm 1: new plan")}`, async () => {
	const customerId = "attach-inv-draft-imm-new-plan";

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

	// Attach with invoice mode (draft, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is returned and is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeNull();

	// Verify Stripe invoice is draft
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

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
		latestStatus: "draft",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade (draft, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with invoice mode
 *
 * Expected Result:
 * - Draft invoice for prorated difference
 * - Product switched immediately
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-imm 2: upgrade")}`, async () => {
	const customerId = "attach-inv-draft-imm-upgrade";

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
	// At start of cycle, full price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// Attach premium with invoice mode (draft, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeNull();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");

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

	// Verify invoices: pro ($20) + upgrade ($30 draft)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "draft",
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
// TEST 3: Downgrade (draft, immediate)
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
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-imm 3: downgrade")}`, async () => {
	const customerId = "attach-inv-draft-imm-downgrade";

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

	// Attach pro with invoice mode (draft, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: false,
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
// TEST 4: One-off (draft, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach one-off credits with invoice mode
 *
 * Expected Result:
 * - Draft invoice created
 * - Credits granted immediately
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-imm 4: one-off")}`, async () => {
	const customerId = "attach-inv-draft-imm-oneoff";

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

	// Attach with invoice mode (draft, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");

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
		latestStatus: "draft",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One-off on existing subscription (draft, immediate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Purchase one-off credits add-on with invoice mode
 *
 * Expected Result:
 * - Both products exist
 * - Draft invoice for one-off only
 * - Credits granted immediately
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-draft-imm 5: one-off on existing sub")}`, async () => {
	const customerId = "attach-inv-draft-imm-oneoff-existing";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	const oneOffAddon = products.oneOff({
		id: "one-off-addon",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, oneOffAddon] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	// After initScenario, pro.id and oneOffAddon.id are mutated to include the prefix

	// Preview one-off add-on - base ($10) + prepaid ($5) = $15
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
	});
	expect(preview.total).toBe(15);

	// Attach one-off with invoice mode (draft, immediate)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice is draft
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("draft");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [pro.id, oneOffAddon.id],
	});

	// Verify combined balance (100 from pro + 50 from one-off = 150)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 0,
	});

	// Verify invoices: pro ($20 paid) + one-off ($15 draft)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "draft",
	});
});
