/**
 * Integration tests for subscription discounts in update subscription flow.
 *
 * These tests verify that discounts applied to subscriptions are correctly
 * detected and applied during subscription updates.
 *
 * Note: Customer-level discounts were removed in Stripe API version 2025-09-30.clover.
 * Discounts can now only be applied to subscriptions or checkout sessions.
 *
 * @see https://docs.stripe.com/changelog/clover/2025-09-30/add-discount-source-property
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

const billingUnits = 12;
const pricePerUnit = 10;

const getStripeInfo = async ({ customerId }: { customerId: string }) => {
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

	return {
		stripeCli,
		stripeCustomerId,
		subscription: subscriptions.data[0],
	};
};

/**
 * Apply a coupon to a Stripe customer.
 * Uses legacy API version because customer-level coupons are not supported
 * in Stripe API version 2025-09-30.clover and later.
 */
const applyCustomerCoupon = async ({
	stripeCustomerId,
	couponId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	couponId: string;
}) => {
	const legacyStripeCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});

	await legacyStripeCli.rawRequest(
		"POST",
		`/v1/customers/${stripeCustomerId}`,
		{
			coupon: couponId,
		},
	);
};

test.concurrent(`${chalk.yellowBright("discount: customer-level 20% discount applied to subscription update")}`, async () => {
	const customerId = "discount-customer-level-20pct";

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

	const { stripeCli, stripeCustomerId } = await getStripeInfo({ customerId });

	const coupon = await stripeCli.coupons.create({
		percent_off: 20,
		duration: "forever",
	});

	await applyCustomerCoupon({
		stripeCli,
		stripeCustomerId,
		couponId: coupon.id,
	});

	const stripeCustomer = await stripeCli.customers.retrieve(stripeCustomerId, {
		expand: ["discount.source.coupon.applies_to"],
	});

	if (stripeCustomer.deleted) {
		throw new Error("Stripe customer was deleted");
	}

	const customerDiscount = stripeCustomer.discount as {
		source?: { coupon?: { id: string } };
	} | null;
	expect(customerDiscount?.source?.coupon?.id).toBe(coupon.id);

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.8);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	expect(result.invoice?.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: customer discount ignored when subscription has its own discount")}`, async () => {
	const customerId = "discount-sub-priority-over-cus";

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

	const { stripeCli, stripeCustomerId, subscription } = await getStripeInfo({
		customerId,
	});

	const customerCoupon = await stripeCli.coupons.create({
		percent_off: 50,
		duration: "forever",
	});

	const subscriptionCoupon = await stripeCli.coupons.create({
		percent_off: 10,
		duration: "forever",
	});

	await applyCustomerCoupon({
		stripeCli,
		stripeCustomerId,
		couponId: customerCoupon.id,
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: subscriptionCoupon.id }],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.9);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: customer-level $10 amount-off discount")}`, async () => {
	const customerId = "discount-customer-level-10-off";

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

	const { stripeCli, stripeCustomerId } = await getStripeInfo({ customerId });

	const coupon = await stripeCli.coupons.create({
		amount_off: 1000,
		currency: "usd",
		duration: "repeating",
		duration_in_months: 12,
	});

	await applyCustomerCoupon({
		stripeCli,
		stripeCustomerId,
		couponId: coupon.id,
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = 100 - 10;
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});

test.concurrent(`${chalk.yellowBright("discount: customer discount used when subscription has no discounts")}`, async () => {
	const customerId = "discount-cus-fallback";

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

	const { stripeCli, stripeCustomerId, subscription } = await getStripeInfo({
		customerId,
	});

	const coupon = await stripeCli.coupons.create({
		percent_off: 30,
		duration: "forever",
	});

	await applyCustomerCoupon({
		stripeCli,
		stripeCustomerId,
		couponId: coupon.id,
	});

	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
		],
	});

	const refundAmount = -50;
	const discountedCharge = Math.round(100 * 0.7);
	const expectedAmount = refundAmount + discountedCharge;

	expect(preview.total).toBe(expectedAmount);
});
