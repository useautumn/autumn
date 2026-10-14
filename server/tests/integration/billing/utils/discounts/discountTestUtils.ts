import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

export const getStripeSubscription = async ({
	customerId,
	expand,
}: {
	customerId: string;
	expand?: string[];
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
		expand,
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

export const applyCustomerDiscount = async ({
	stripeCli,
	customerId,
	couponId,
}: {
	stripeCli: Stripe;
	customerId: string;
	couponId: string;
}): Promise<void> => {
	const subscriptions = await stripeCli.subscriptions.list({
		customer: customerId,
		status: "all",
	});

	for (const sub of subscriptions.data) {
		await stripeCli.subscriptions.update(sub.id, {
			discounts: [{ coupon: couponId }],
		});
	}
};

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

export const removeCustomerDiscount = async ({
	stripeCli,
	customerId,
}: {
	stripeCli: Stripe;
	customerId: string;
}): Promise<void> => {
	const subscriptions = await stripeCli.subscriptions.list({
		customer: customerId,
		status: "all",
	});

	for (const sub of subscriptions.data) {
		await stripeCli.subscriptions.update(sub.id, {
			discounts: [],
		});
	}
};

export const createPromotionCode = async ({
	stripeCli,
	coupon,
	code,
	firstTimeTransaction,
}: {
	stripeCli: Stripe;
	coupon: Stripe.Coupon;
	code: string;
	firstTimeTransaction?: boolean;
}) => {
	return stripeCli.promotionCodes.create({
		promotion: {
			type: "coupon",
			coupon: coupon.id,
		},
		code: `${code}${Date.now()}`,
		...(firstTimeTransaction
			? { restrictions: { first_time_transaction: true } }
			: {}),
	});
};

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

export const deleteCoupon = async ({
	stripeCli,
	couponId,
}: {
	stripeCli: Stripe;
	couponId: string;
}): Promise<void> => {
	await stripeCli.coupons.del(couponId);
};
