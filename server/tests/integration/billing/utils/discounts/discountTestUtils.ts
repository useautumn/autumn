/**
 * Shared utilities for discount integration tests.
 */

import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

/**
 * Get Stripe subscription and client for a customer.
 */
export const getStripeSubscription = async ({
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

/**
 * Create a percent-off coupon.
 */
export const createPercentCoupon = async ({
	stripeCli,
	percentOff,
	duration = "forever",
	durationInMonths,
	appliesToProducts,
}: {
	stripeCli: Stripe;
	percentOff: number;
	duration?: "forever" | "once" | "repeating";
	durationInMonths?: number;
	appliesToProducts?: string[];
}) => {
	return stripeCli.coupons.create({
		percent_off: percentOff,
		duration,
		...(duration === "repeating" && durationInMonths
			? { duration_in_months: durationInMonths }
			: {}),
		...(appliesToProducts
			? { applies_to: { products: appliesToProducts } }
			: {}),
	});
};

/**
 * Create an amount-off coupon.
 * Note: amount_off requires currency and duration "repeating" or "once".
 */
export const createAmountCoupon = async ({
	stripeCli,
	amountOffCents,
	currency = "usd",
	durationInMonths = 12,
	appliesToProducts,
}: {
	stripeCli: Stripe;
	amountOffCents: number;
	currency?: string;
	durationInMonths?: number;
	appliesToProducts?: string[];
}) => {
	return stripeCli.coupons.create({
		amount_off: amountOffCents,
		currency,
		duration: "repeating",
		duration_in_months: durationInMonths,
		...(appliesToProducts
			? { applies_to: { products: appliesToProducts } }
			: {}),
	});
};

/**
 * Apply discount(s) to a subscription.
 */
export const applySubscriptionDiscount = async ({
	stripeCli,
	subscriptionId,
	couponIds,
}: {
	stripeCli: Stripe;
	subscriptionId: string;
	couponIds: string[];
}) => {
	return stripeCli.subscriptions.update(subscriptionId, {
		discounts: couponIds.map((id) => ({ coupon: id })),
	});
};

/**
 * Apply discount to all of a customer's subscriptions.
 *
 * Note: In Stripe API 2025+, customer-level coupons via customers.update({ coupon })
 * are deprecated. Instead, we apply the discount to all customer subscriptions.
 * This achieves the same effect for testing purposes.
 */
export const applyCustomerDiscount = async ({
	stripeCli,
	customerId,
	couponId,
}: {
	stripeCli: Stripe;
	customerId: string;
	couponId: string;
}): Promise<void> => {
	// Get all customer subscriptions
	const subscriptions = await stripeCli.subscriptions.list({
		customer: customerId,
		status: "all",
	});

	// Apply discount to each subscription
	for (const sub of subscriptions.data) {
		await stripeCli.subscriptions.update(sub.id, {
			discounts: [{ coupon: couponId }],
		});
	}
};

/**
 * Remove discount from a subscription.
 */
export const removeSubscriptionDiscount = async ({
	stripeCli,
	subscriptionId,
}: {
	stripeCli: Stripe;
	subscriptionId: string;
}) => {
	return stripeCli.subscriptions.update(subscriptionId, {
		discounts: [],
	});
};

/**
 * Remove discount from all of a customer's subscriptions.
 */
export const removeCustomerDiscount = async ({
	stripeCli,
	customerId,
}: {
	stripeCli: Stripe;
	customerId: string;
}): Promise<void> => {
	// Get all customer subscriptions
	const subscriptions = await stripeCli.subscriptions.list({
		customer: customerId,
		status: "all",
	});

	// Remove discounts from each subscription
	for (const sub of subscriptions.data) {
		await stripeCli.subscriptions.update(sub.id, {
			discounts: [],
		});
	}
};

/**
 * Create a Stripe promotion code wrapping a coupon.
 * Code is made unique per-call to avoid collisions in concurrent tests.
 */
export const createPromotionCode = async ({
	stripeCli,
	coupon,
	code,
}: {
	stripeCli: Stripe;
	coupon: Stripe.Coupon;
	code: string;
}) => {
	return stripeCli.promotionCodes.create({
		promotion: {
			type: "coupon",
			coupon: coupon.id,
		},
		code: `${code}${Date.now()}`,
	});
};

/*
 * Apply a coupon directly to a Stripe customer (not a subscription).
 * Uses a legacy Stripe API version + rawRequest to mirror the exact
 * handleStripeInvoiceDiscounts rollover flow (line 28 + line 140-146).
 */
export const applyCustomerCoupon = async ({
	stripeCustomerId,
	couponId,
}: {
	stripeCustomerId: string;
	couponId: string;
}): Promise<void> => {
	const legacyCli = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});
	await legacyCli.rawRequest("POST", `/v1/customers/${stripeCustomerId}`, {
		coupon: couponId,
	});
};

/**
 * Delete a coupon from Stripe. The discount on the subscription/customer remains,
 * but the underlying coupon object no longer exists.
 * This simulates the state created by handleStripeInvoiceDiscounts rollover.
 */
export const deleteCoupon = async ({
	stripeCli,
	couponId,
}: {
	stripeCli: Stripe;
	couponId: string;
}): Promise<void> => {
	await stripeCli.coupons.del(couponId);
};
