/**
 * Immediate Switch Basic Tests (Attach V2)
 *
 * Tests for basic upgrade scenarios where a higher-tier product takes effect immediately.
 *
 * Key behaviors:
 * - Upgrade replaces existing product immediately
 * - Prorated charge for price difference
 * - Scheduled downgrades are cancelled when upgrading
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Upgrade to pro ($20/mo)
 *
 * Expected Result:
 * - Pro is active, free is removed
 * - Invoice for pro base price ($20)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 1: free to pro")}`, async () => {
	const customerId = "imm-switch-free-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// 1. Preview upgrade - verify pro base price ($20)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attach pro (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Verify messages feature has pro's balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify invoice matches preview total: $20
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro to Premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo)
 *
 * Expected Result:
 * - Premium is active, pro is removed
 * - Prorated charge for price difference
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 2: pro to premium")}`, async () => {
	const customerId = "imm-switch-pro-to-premium";

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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// 1. Preview upgrade - verify prorated charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// At start of cycle, full price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify messages feature has premium's balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Verify invoices: pro ($20) + upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro to Premium mid-cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Advance 15 days
 * - Upgrade to premium ($50/mo)
 *
 * Expected Result:
 * - Prorated charge for remaining half of cycle
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 3: pro to premium mid-cycle")}`, async () => {
	const customerId = "imm-switch-pro-premium-midcycle";

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

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Calculate expected prorated amount using actual billing period from Stripe
	const expectedTotal = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: 20, // Pro base price
		newAmount: 50, // Premium base price
	});

	// 1. Preview upgrade mid-cycle - prorated charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify invoices: pro ($20) + prorated upgrade
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro to Free (scheduled) to Premium (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro
 * - Downgrade to free (scheduled for end of cycle)
 * - Upgrade to premium (should cancel scheduled downgrade)
 *
 * Expected Result:
 * - Scheduled downgrade is cancelled
 * - Premium is active immediately
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 4: pro to free to premium")}`, async () => {
	const customerId = "imm-switch-pro-free-premium";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

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

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: free.id }), // Downgrade - scheduled
		],
	});

	// Verify scheduled state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBefore,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerBefore,
		productId: free.id,
	});

	// 1. Preview upgrade to premium
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Upgrade from pro ($20) to premium ($50) = $30 difference
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade - should cancel scheduled downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states - premium active, pro and free removed
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id, free.id],
	});

	// Verify messages has premium's balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium to Pro (scheduled) to Ultra (upgrade cancels scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro (scheduled for end of cycle)
 * - Upgrade to ultra ($200/mo) - should cancel scheduled downgrade
 *
 * Expected Result:
 * - Scheduled downgrade is cancelled
 * - Ultra is active immediately
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 5: premium to pro to ultra")}`, async () => {
	const customerId = "imm-switch-premium-pro-ultra";

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

	const ultraMessagesItem = items.monthlyMessages({ includedUsage: 5000 });
	const ultra = products.ultra({
		id: "ultra",
		items: [ultraMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ultra] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }), // Downgrade - scheduled
		],
	});

	// Verify scheduled state before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerBefore,
		productId: pro.id,
	});

	// 1. Preview upgrade to ultra
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: ultra.id,
	});
	// Upgrade from premium ($50) to ultra ($200) = $150 difference
	expect(preview.total).toBe(150);

	// 2. Attach ultra (upgrade - should cancel scheduled downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states - ultra active, premium and pro removed
	await expectCustomerProducts({
		customer,
		active: [ultra.id],
		notPresent: [premium.id, pro.id],
	});

	// Verify messages has ultra's balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 5000,
		balance: 5000,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Invoice line item metadata and price_data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Upgrade to pro with invoice mode
 *
 * Expected Result:
 * - Invoice line items have correct metadata:
 *   - autumn_product_id
 *   - autumn_price_id
 *   - stripe_product_id (when available)
 * - Line items with positive amounts use price_data (when stripe_product_id exists)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-basic 6: invoice line item metadata and price_data")}`, async () => {
	const customerId = "imm-switch-metadata-price-data";

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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Upgrade from pro to premium with invoice mode to get invoice response
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		// invoice: true,
		// finalize_invoice: true,
		// enable_product_immediately: true,
		redirect_mode: "if_required",
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	// Retrieve the Stripe invoice with line items expanded
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
		{ expand: ["lines.data"] },
	);

	// Verify invoice has line items (charge for premium, refund for pro)
	expect(stripeInvoice.lines.data.length).toBeGreaterThan(0);

	// Check each line item for metadata and price_data
	for (const lineItem of stripeInvoice.lines.data) {
		const metadata = lineItem.metadata;

		// Verify autumn metadata is present
		expect(metadata).toBeDefined();
		expect(metadata?.autumn_product_id).toBeDefined();
		expect(metadata?.autumn_price_id).toBeDefined();

		// Verify shouldUsePriceData logic:
		// - Positive amounts with stripe_product_id should use price_data
		// - This manifests as the line having pricing.price_details with product reference
		// - Negative amounts (refunds) should NOT have price_data
		if (lineItem.amount > 0 && metadata?.stripe_product_id) {
			expect(lineItem.pricing?.price_details).toBeDefined();
			expect(lineItem.pricing?.price_details?.product).toBe(
				metadata.stripe_product_id,
			);
		}
	}

	// Verify the total is correct (upgrade from $20 to $50 = $30 difference)
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: 30, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});
});
