import { type StripeDiscountWithCoupon, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeResourceAlreadyExists } from "@/external/stripe/common/utils/isStripeResourceAlreadyExists";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { replacedSubscriptionPeriodEndMs } from "../../utils/replacedSubscriptionPeriodEndMs";
import {
	remainingDiscountMonths,
	type SubscriptionRenewal,
} from "./remainingDiscountMonths";

const DEFAULT_RENEWAL: SubscriptionRenewal = {
	interval: "month",
	intervalCount: 1,
};

const subscriptionDiscountIds = (subscription: Stripe.Subscription) =>
	new Set(
		(subscription.discounts ?? []).map((discount) =>
			typeof discount === "string" ? discount : discount.id,
		),
	);

const subscriptionRenewal = (
	subscription: Stripe.Subscription,
): SubscriptionRenewal => {
	const recurring = subscription.items.data.find(
		(item) => item.price?.recurring,
	)?.price.recurring;
	return recurring
		? { interval: recurring.interval, intervalCount: recurring.interval_count }
		: DEFAULT_RENEWAL;
};

/** The coupon cut to the months the old discount had left. */
const remainingCoupon = ({
	coupon,
	months,
}: {
	coupon: Stripe.Coupon;
	months: number;
}): Stripe.Coupon => ({
	...coupon,
	duration: "repeating",
	duration_in_months: months,
});

/** One copy per replaced subscription and remaining months, so a retried recreate reuses it. */
const createCouponCopy = async ({
	ctx,
	coupon,
	replacedStripeSubscription,
}: {
	ctx: AutumnContext;
	coupon: Stripe.Coupon;
	replacedStripeSubscription: Stripe.Subscription;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const id = `${coupon.id}_${replacedStripeSubscription.id}_${coupon.duration_in_months}m`;
	try {
		return await stripeCli.coupons.create({
			id,
			name: coupon.name ?? undefined,
			percent_off: coupon.percent_off ?? undefined,
			amount_off: coupon.amount_off ?? undefined,
			currency: coupon.currency ?? undefined,
			duration: coupon.duration,
			duration_in_months: coupon.duration_in_months ?? undefined,
			applies_to: coupon.applies_to ?? undefined,
			metadata: coupon.metadata ?? undefined,
		});
	} catch (error) {
		if (!isStripeResourceAlreadyExists(error)) throw error;
		return await stripeCli.coupons.retrieve(id);
	}
};

const carryDiscount = async ({
	ctx,
	discount,
	replacedStripeSubscription,
	currentEpochMs,
	preview,
}: {
	ctx: AutumnContext;
	discount: StripeDiscountWithCoupon;
	replacedStripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
	preview: boolean;
}): Promise<StripeDiscountWithCoupon | undefined> => {
	const { coupon } = discount.source;
	if (coupon.duration === "forever") return { source: { coupon } };
	if (coupon.duration !== "repeating" || !discount.end) return undefined;

	const periodEndMs = replacedSubscriptionPeriodEndMs({
		replacedStripeSubscription,
	});
	if (periodEndMs === undefined) return undefined;

	const months = remainingDiscountMonths({
		currentEpochMs,
		billingCycleAnchorMs: secondsToMs(
			replacedStripeSubscription.billing_cycle_anchor,
		),
		periodEndMs,
		renewal: subscriptionRenewal(replacedStripeSubscription),
		discountEndMs: secondsToMs(discount.end),
	});
	if (months === 0) return undefined;

	const carriedCoupon = remainingCoupon({ coupon, months });
	if (preview) return { source: { coupon: carriedCoupon } };

	return {
		source: {
			coupon: await createCouponCopy({
				ctx,
				coupon: carriedCoupon,
				replacedStripeSubscription,
			}),
		},
	};
};

/**
 * A subscription's own discounts can't be reused on another one, so each moves as its coupon:
 * forever as is, repeating for its remaining months; a once discount was already spent.
 */
export const carryReplacedSubscriptionDiscounts = async ({
	ctx,
	stripeDiscounts = [],
	replacedStripeSubscription,
	currentEpochMs,
	preview,
}: {
	ctx: AutumnContext;
	stripeDiscounts?: StripeDiscountWithCoupon[];
	replacedStripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
	preview: boolean;
}): Promise<StripeDiscountWithCoupon[]> => {
	const ownDiscountIds = subscriptionDiscountIds(replacedStripeSubscription);
	const carried = await Promise.all(
		stripeDiscounts.map((discount) =>
			discount.id && ownDiscountIds.has(discount.id)
				? carryDiscount({
						ctx,
						discount,
						replacedStripeSubscription,
						currentEpochMs,
						preview,
					})
				: discount,
		),
	);
	return carried.filter(
		(discount): discount is StripeDiscountWithCoupon => discount !== undefined,
	);
};
