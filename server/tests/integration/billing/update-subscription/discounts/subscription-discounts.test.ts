/**
 * Integration tests for Stripe discounts in update subscription flow.
 *
 * These tests verify that discounts applied at subscription or customer level
 * are correctly reflected in preview totals, and that discount identity/duration
 * is preserved through cancel/uncancel operations.
 */

import { expect, test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const billingUnits = 12;
const pricePerUnit = 10;

// =============================================================================
// PERCENT-OFF DISCOUNT TESTS
// =============================================================================

test.concurrent(`${chalk.yellowBright("discount: 20% off subscription discount applied to upgrade")}`, async () => {
	const customerId = "discount-20pct-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Create a 20% off coupon and apply to subscription
	const coupon = await stripeCli.coupons.create({
		percent_off: 20,
		duration: "forever",
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	// Preview upgrade from 5 to 10 units (adding 5 units)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge with 20% off: $100 * 0.8 = $80
	// Total: -$50 + $80 = $30
	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: 50% off subscription discount")}`, async () => {
	const customerId = "discount-50pct-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await stripeCli.coupons.create({
		percent_off: 50,
		duration: "forever",
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge with 50% off: $100 * 0.5 = $50
	// Total: -$50 + $50 = $0
	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.5);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: 100% off subscription discount (free)")}`, async () => {
	const customerId = "discount-100pct-free";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await stripeCli.coupons.create({
		percent_off: 100,
		duration: "forever",
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge with 100% off: $100 * 0 = $0
	// Total: -$50 + $0 = -$50
	expect(preview.total).toBe(-50);
});

// =============================================================================
// AMOUNT-OFF DISCOUNT TESTS
// =============================================================================

test.concurrent(`${chalk.yellowBright("discount: $10 off amount discount applied to upgrade")}`, async () => {
	const customerId = "discount-10dollars-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// $10 off coupon (1000 cents) - amount_off requires repeating duration
	const coupon = await stripeCli.coupons.create({
		amount_off: 1000,
		currency: "usd",
		duration: "repeating",
		duration_in_months: 12,
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge with $10 off: $100 - $10 = $90
	// Total: -$50 + $90 = $40
	const refundAmount = -50;
	const discountedCharge = 100 - 10;
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: charge capped at zero when discount exceeds charge")}`, async () => {
	const customerId = "discount-cap-at-zero";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// $100 off coupon (10000 cents) - more than the $100 new charge
	// amount_off requires repeating duration
	const coupon = await stripeCli.coupons.create({
		amount_off: 10000,
		currency: "usd",
		duration: "repeating",
		duration_in_months: 12,
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Charge is capped at 0 (100 - 100 = 0), but refund for unused still applies
	// Net = -$50 (refund) + $0 (discounted charge) = -$50
	expect(preview.total).toBe(-50);
});

// =============================================================================
// MULTIPLE DISCOUNT TESTS
// =============================================================================

test.concurrent(`${chalk.yellowBright("discount: multiple discounts stack (20% + 10%)")}`, async () => {
	const customerId = "discount-multiple-stack";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Create two coupons: 20% and 10%
	const coupon1 = await stripeCli.coupons.create({
		percent_off: 20,
		duration: "forever",
	});

	const coupon2 = await stripeCli.coupons.create({
		percent_off: 10,
		duration: "forever",
	});

	// Apply both discounts to subscription
	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon1.id }, { coupon: coupon2.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge: $100, 20% off = $80, then 10% off = $72
	// Total: -$50 + $72 = $22
	const refundAmount = -50;
	const afterFirstDiscount = Math.round(100 * 0.8);
	const discountedCharge = Math.round(afterFirstDiscount * 0.9);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: promotion code applied to subscription")}`, async () => {
	const customerId = "discount-promo-code";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
				],
			}),
		],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Create a coupon and promotion code
	const coupon = await stripeCli.coupons.create({
		percent_off: 25,
		duration: "forever",
	});

	const promotionCode = await stripeCli.promotionCodes.create({
		promotion: {
			type: "coupon",
			coupon: coupon.id,
		},
		code: `SAVE25-${customerId}-${Date.now()}`,
	});

	// Apply via promotion code
	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ promotion_code: promotionCode.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	// Upgrade generates: refund (-$50) + charge ($100)
	// Discounts only apply to charges, not refunds
	// Charge with 25% off: $100 * 0.75 = $75
	// Total: -$50 + $75 = $25
	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.75);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

// =============================================================================
// DISCOUNT PRESERVATION: CANCEL / UNCANCEL
// =============================================================================

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 2-month repeating 20% off coupon
 * - Advance 2 weeks (mid-cycle)
 * - Cancel at end of cycle
 * - Uncancel
 *
 * Expected:
 * - Discount ID unchanged (same di_xxx)
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("discount: cancel then uncancel preserves discount identity and duration")}`, async () => {
	const customerId = "discount-cancel-uncancel";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Apply 2-month repeating 20% off coupon
	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	// Record discount before any changes
	const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountBefore = subWithDiscount.discounts![0];
	const discountIdBefore =
		typeof discountBefore !== "string" ? discountBefore.id : null;
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	// Advance 2 weeks
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	// Cancel at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Uncancel
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	// Verify discount is preserved
	const subAfter = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = subAfter.discounts![0];
	const discountIdAfter =
		typeof discountAfter !== "string" ? discountAfter.id : null;
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter.end : null;

	// Discount ID must be the same (not re-created)
	expect(discountIdAfter).toBe(discountIdBefore);

	// Discount end must be the same (duration not reset)
	expect(discountEndAfter).toBe(discountEndBefore);
});
