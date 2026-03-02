/**
 * Discount Invoice Line Items Tests
 *
 * Tests for verifying that discount information is correctly persisted
 * on invoice line items across different billing flows:
 * - New plan attach with discount
 * - Upgrade with discount
 * - Stripe Checkout with discount
 * - Renewal with discount (forever duration)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: New plan with percent-off discount - verify discount info on line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with payment method
 * - Create Pro ($20/mo) with prepaid messages (0 included, $10/100 units)
 * - Create 25% off coupon
 * - Attach Pro with 200 messages + discount
 *
 * Expected:
 * - Base price: $20 pre-discount, $15 after (25% off = $5 off)
 * - Prepaid messages: $20 (2 packs × $10), $15 after (25% off = $5 off)
 * - Each charge line item has discount entry with amount_off + stripe_coupon_id
 */
test.concurrent(`${chalk.yellowBright("line-item-discounts A: new plan with percent-off discount")}`, async () => {
	const customerId = "li-disc-new-plan";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-disc-new",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const prepaidPrice = 20; // 0 included, 200 qty → 200/100 = 2 packs × $10
	const percentOff = 25;
	const basePriceAfterDiscount = 15; // $20 * 0.75
	const prepaidAfterDiscount = 15; // $20 * 0.75

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	const expectedTotalAfterDiscount =
		basePriceAfterDiscount + prepaidAfterDiscount; // $30

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotalAfterDiscount,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify discount info on line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			// Base price: $20 pre-discount, $15 after
			{
				isBasePrice: true,
				amount: basePrice,
				discount: {
					amountAfterDiscounts: basePriceAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Prepaid messages: $20 pre-discount (2 packs), $15 after
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				discount: {
					totalAmountAfterDiscounts: prepaidAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Upgrade with percent-off discount - verify discount info on line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with:
 *   - Prepaid messages (100 included, $10/100 units) - buy 300 (2 packs paid)
 *   - Consumable words (50 included, $0.05/unit overage) - track 200 (150 overage)
 * - Create 20% off coupon
 * - Upgrade to Premium ($50/mo) with:
 *   - Prepaid messages (200 included, $15/100 units) - buy 500 (3 packs paid)
 *   - Consumable words (100 included, $0.05/unit overage)
 *
 * Expected:
 * - Pro refund line items: NO discount (discounts don't apply to refunds)
 * - Premium charge line items: 20% discount applied (base + prepaid)
 * - Consumable words arrear (from Pro usage): 20% discount applied
 */
test.concurrent(`${chalk.yellowBright("line-item-discounts B: upgrade with percent-off discount")}`, async () => {
	const customerId = "li-disc-upgrade";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const proConsumable = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro-disc-upg",
		items: [proPrepaid, proConsumable],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 200,
		billingUnits: 100,
		price: 15,
	});
	const premiumConsumable = items.consumableWords({ includedUsage: 100 });

	const premium = products.premium({
		id: "premium-disc-upg",
		items: [premiumPrepaid, premiumConsumable],
	});

	const proMessagesQuantity = 300;
	const wordsTracked = 200;
	const premiumMessagesQuantity = 500;
	const percentOff = 20;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: proMessagesQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: premiumMessagesQuantity },
		],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify discount info on line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedLineItems: [
			// Pro base refund: NO discount (discounts don't apply to refunds)
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
				discount: {
					hasDiscounts: false,
				},
			},
			// Pro prepaid messages refund: NO discount
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				productId: pro.id,
				billingTiming: "in_advance",
				minCount: 1,
				discount: {
					hasDiscounts: false,
				},
			},
			// Premium base charge: has 20% discount
			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Premium prepaid messages charge: has 20% discount
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				productId: premium.id,
				billingTiming: "in_advance",
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Consumable words arrear (from Pro usage): has 20% discount
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Stripe Checkout with percent-off discount - verify discount on line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method (triggers checkout)
 * - Create Pro ($20/mo) with prepaid messages (0 included, $10/100 units)
 * - Create 25% off coupon
 * - Attach Pro with 200 messages + discount → checkout URL
 * - Complete Stripe Checkout
 *
 * Expected:
 * - Same discount structure as Test A, but via checkout flow
 * - All charge line items have discount entries with coupon ID
 */
test.concurrent(`${chalk.yellowBright("line-item-discounts C: stripe checkout with percent-off discount")}`, async () => {
	const customerId = "li-disc-checkout";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-disc-checkout",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const prepaidPrice = 20; // 2 packs (200/100 × $10)
	const percentOff = 25;
	const basePriceAfterDiscount = 15; // $20 * 0.75
	const prepaidAfterDiscount = 15; // $20 * 0.75
	const expectedTotalAfterDiscount =
		basePriceAfterDiscount + prepaidAfterDiscount; // $30

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method - triggers checkout
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	// Attach - returns payment_url (checkout mode)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotalAfterDiscount,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify discount info on line items via checkout flow
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			// Base price: $20 pre-discount, $15 after
			{
				isBasePrice: true,
				amount: basePrice,
				discount: {
					amountAfterDiscounts: basePriceAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Prepaid messages: $20 pre-discount, $15 after
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				discount: {
					totalAmountAfterDiscounts: prepaidAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST D: Renewal with forever discount - verify discount persists on renewal line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create Pro ($20/mo) with:
 *   - Prepaid messages (0 included, $10/100 units)
 *   - Consumable words (50 included, $0.05/unit overage)
 * - Create 25% off coupon (duration: forever)
 * - Attach Pro with 200 messages + discount
 * - Track 200 words (150 overage → $7.50 arrear charge before discount)
 * - Advance to next billing cycle
 *
 * Expected:
 * - Renewal line items all have discount entries with coupon ID
 * - Base price, prepaid, and arrear all discounted
 */
test.concurrent(`${chalk.yellowBright("line-item-discounts D: renewal with forever discount")}`, async () => {
	const customerId = "li-disc-renewal";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro-disc-renew",
		items: [prepaidMessages, consumableWords],
	});

	const percentOff = 25;
	const wordsTracked = 200;

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
		duration: "forever",
	});

	// Attach with discount
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	// Track words into overage (200 tracked, 50 included = 150 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: wordsTracked,
	});
	await timeout(5000);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have initial + renewal invoice
	expect(
		customer.invoices?.length,
		"Expected at least 2 invoices (initial + renewal)",
	).toBeGreaterThanOrEqual(2);

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify discount info persists on renewal line items
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedLineItems: [
			// Base price renewal: has discount
			{
				isBasePrice: true,
				direction: "charge",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Prepaid messages renewal: has discount
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			// Consumable words arrear: has discount
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});
