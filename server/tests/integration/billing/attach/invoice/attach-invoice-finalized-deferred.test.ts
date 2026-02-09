/**
 * Attach Invoice Mode Tests - Finalized + Deferred
 *
 * Tests for invoice mode with:
 * - invoice: true
 * - finalize_invoice: true (invoice is finalized/open)
 * - enable_product_immediately: false (product waits for payment)
 *
 * Use case: Most "invoice-like" behavior. Invoice is sent, product only activates after payment.
 * Common for prepaid/credit purchases and enterprise upgrades.
 *
 * Scenarios:
 * 1. New plan (no product → pro)
 * 2. Upgrade (pro → premium)
 * 3. Free to paid
 * 4. One-off credits purchase
 * 5. One-off add-on on existing subscription
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
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
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New plan (finalized, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach pro with invoice mode (finalized, deferred)
 *
 * Expected Result:
 * - Open invoice created (with payment_url)
 * - Product NOT activated until payment
 * - After payment: product activates
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-def 1: new plan")}`, async () => {
	const customerId = "attach-inv-fin-def-new-plan";

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

	// Attach with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open and payment_url is provided
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - product should NOT be activated (deferred)
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Verify invoice status in customer
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: preview.total,
		latestStatus: "open",
	});

	// Complete payment
	await completeInvoiceCheckout({
		url: result.payment_url!,
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
// TEST 2: Upgrade (finalized, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with invoice mode (finalized, deferred)
 *
 * Expected Result:
 * - Open invoice for prorated difference
 * - Product NOT switched until payment
 * - After payment: premium active
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-def 2: upgrade")}`, async () => {
	const customerId = "attach-inv-fin-def-upgrade";

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

	// Attach premium with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - should still have pro's balance (500)
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Complete payment
	await completeInvoiceCheckout({
		url: result.payment_url!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - premium active, pro removed
	await expectCustomerProducts({
		customer: customerAfter,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify balance is premium's balance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
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
// TEST 3: Free to paid (finalized, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Upgrade to pro ($20/mo) with invoice mode (finalized, deferred)
 *
 * Expected Result:
 * - Open invoice for full price
 * - Product stays free until payment
 * - After payment: pro active
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-def 3: free to paid")}`, async () => {
	const customerId = "attach-inv-fin-def-free-to-paid";

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx: testCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: "free" })],
	});

	// After initScenario, free.id and pro.id are mutated to include the prefix

	// Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20); // Full pro price

	// Attach pro with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - should still have free's balance (50)
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Complete payment
	await completeInvoiceCheckout({
		url: result.payment_url!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - pro active, free removed
	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Verify balance is pro's balance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
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
// TEST 4: One-off (finalized, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach one-off credits with invoice mode (finalized, deferred)
 *
 * Expected Result:
 * - Open invoice created
 * - Credits NOT granted until payment
 * - After payment: credits granted
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-def 4: one-off")}`, async () => {
	const customerId = "attach-inv-fin-def-oneoff";

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

	// Attach with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - credits should NOT be granted
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	// Complete payment
	await completeInvoiceCheckout({
		url: result.payment_url!,
	});

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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One-off add-on on existing subscription (finalized, deferred)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Purchase one-off credits add-on with invoice mode (finalized, deferred)
 *
 * Expected Result:
 * - Pro still active
 * - Open invoice for one-off only
 * - Credits NOT granted until payment
 * - After payment: both products active, credits granted
 */
test.concurrent(`${chalk.yellowBright("attach-invoice-fin-def 5: one-off addon")}`, async () => {
	const customerId = "attach-inv-fin-def-oneoff-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const oneOffCreditsItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	const oneOffAddon = products.oneOff({
		id: "one-off-addon",
		items: [oneOffCreditsItem],
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

	// Verify pro is attached with correct balance
	const customerInit = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerInit,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Preview one-off add-on - base ($10) + prepaid ($5) = $15
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
	});
	expect(preview.total).toBe(15);

	// Attach one-off with invoice mode (finalized, deferred)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	// Verify invoice is open
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.invoice!.total).toBe(preview.total);
	expect(result.invoice!.hosted_invoice_url).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Before payment - pro still active, balance still 100 (add-on credits not granted)
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 100, // Still just pro's balance
		usage: 0,
	});

	// Complete payment
	await completeInvoiceCheckout({
		url: result.payment_url!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After payment - both products active
	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id, oneOffAddon.id],
	});

	// Verify combined balance (100 from pro + 50 from one-off = 150)
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 0,
	});

	// Verify invoices: pro ($20 paid) + one-off ($15 paid)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
