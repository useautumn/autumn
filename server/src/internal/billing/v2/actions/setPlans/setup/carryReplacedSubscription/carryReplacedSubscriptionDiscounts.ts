import { type StripeDiscountWithCoupon, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
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

/** A copy of the coupon that runs only the months the old discount had left. */
const createRemainingCoupon = async ({
	ctx,
	coupon,
	months,
}: {
	ctx: AutumnContext;
	coupon: Stripe.Coupon;
	months: number;
}) =>
	createStripeCli({ org: ctx.org, env: ctx.env }).coupons.create({
		id: `${coupon.id}_${generateId("roll")}`,
		name: coupon.name ?? undefined,
		percent_off: coupon.percent_off ?? undefined,
		amount_off: coupon.amount_off ?? undefined,
		currency: coupon.currency ?? undefined,
		duration: "repeating",
		duration_in_months: months,
		applies_to: coupon.applies_to ?? undefined,
		metadata: coupon.metadata ?? undefined,
	});

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

	const months = remainingDiscountMonths({
		currentEpochMs,
		periodEndMs: secondsToMs(
			getLatestPeriodEnd({ sub: replacedStripeSubscription }),
		),
		renewal: subscriptionRenewal(replacedStripeSubscription),
		discountEndMs: secondsToMs(discount.end),
	});
	if (months === 0) return undefined;
	if (preview) return { source: { coupon } };

	return {
		source: { coupon: await createRemainingCoupon({ ctx, coupon, months }) },
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
