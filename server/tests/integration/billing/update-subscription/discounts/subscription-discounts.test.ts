/**
 * Integration tests for Stripe discounts in update subscription flow.
 *
 * These tests verify that discounts applied at subscription or customer level
 * are correctly reflected in preview totals.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

const billingUnits = 12;
const pricePerUnit = 10;

/**
 * Helper to get Stripe subscription for a customer
 */
const getStripeSubscription = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error("Missing Stripe customer ID");
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	if (subscriptions.data.length === 0) {
		throw new Error("No subscriptions found");
	}

	return {
		stripeCli,
		stripeCustomerId,
		subscription: subscriptions.data[0],
	};
};

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
