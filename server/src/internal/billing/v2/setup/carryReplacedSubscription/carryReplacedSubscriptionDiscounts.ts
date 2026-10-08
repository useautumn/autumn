import {
	type StripeDiscountWithCoupon,
	secondsToMs,
	stripeRefToId,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeResourceAlreadyExists } from "@/external/stripe/common/utils/isStripeResourceAlreadyExists";
import { isPromotionCodeRedeemable } from "@/external/stripe/coupons/isPromotionCodeRedeemable";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { removeDiscountsByRewardIds } from "@/internal/billing/v2/providers/stripe/utils/discounts/removeDiscountsByRewardIds";
import { subToDiscounts } from "@/internal/billing/v2/providers/stripe/utils/discounts/subToDiscounts";
import {
	remainingDiscountMonths,
	type SubscriptionRenewal,
} from "./remainingDiscountMonths";
import { replacedSubscriptionPeriodEndMs } from "./replacedSubscriptionPeriodEndMs";

type CarryInput = {
	ctx: AutumnContext;
	replacedStripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
	preview: boolean;
};

const DEFAULT_RENEWAL: SubscriptionRenewal = {
	interval: "month",
	intervalCount: 1,
};

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

/** One copy per replaced subscription and duration, so a retried recreate reuses it. */
const copyCoupon = async ({
	ctx,
	coupon,
	replacedStripeSubscription,
	preview,
}: CarryInput & {
	coupon: Stripe.Coupon;
}): Promise<StripeDiscountWithCoupon> => {
	const durationSuffix =
		coupon.duration === "repeating"
			? `${coupon.duration_in_months}m`
			: coupon.duration;
	const id = `${coupon.id}_${replacedStripeSubscription.id}_${durationSuffix}`;
	if (preview) return { source: { coupon: { ...coupon, id } } };

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		const copy = await stripeCli.coupons.create({
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
		return { source: { coupon: copy } };
	} catch (error) {
		if (!isStripeResourceAlreadyExists(error)) throw error;
		return { source: { coupon: await stripeCli.coupons.retrieve(id) } };
	}
};

/** The promotion code the discount was redeemed with, when Stripe still accepts it for this customer. */
const redeemablePromotionCodeId = async ({
	ctx,
	discount,
	replacedStripeSubscription,
	currentEpochMs,
}: CarryInput & { discount: StripeDiscountWithCoupon }) => {
	const stripeDiscount = replacedStripeSubscription.discounts.find(
		(replacedDiscount) => stripeRefToId(replacedDiscount) === discount.id,
	);
	const promotionCodeId =
		typeof stripeDiscount === "object"
			? stripeRefToId(stripeDiscount.promotion_code)
			: undefined;
	const stripeCustomerId = stripeRefToId(replacedStripeSubscription.customer);
	if (!promotionCodeId) return undefined;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const promotionCode =
		await stripeCli.promotionCodes.retrieve(promotionCodeId);
	return isPromotionCodeRedeemable({
		promotionCode,
		stripeCustomerId,
		currentEpochMs,
	})
		? promotionCodeId
		: undefined;
};

/**
 * A discount id can't move to another subscription, so the discount is redeemed again from the same
 * promotion code or coupon; one Stripe no longer accepts is applied as a copy with the same terms.
 */
const redeemAgain = async ({
	discount,
	coupon,
	...input
}: CarryInput & {
	discount: StripeDiscountWithCoupon;
	coupon: Stripe.Coupon;
}): Promise<StripeDiscountWithCoupon> => {
	const promotionCodeId = await redeemablePromotionCodeId({
		...input,
		discount,
	});
	if (promotionCodeId) return { source: { coupon }, promotionCodeId };
	if (coupon.valid) return { source: { coupon } };
	return copyCoupon({ ...input, coupon });
};

const repeatingMonthsLeft = ({
	discount,
	replacedStripeSubscription,
	currentEpochMs,
}: CarryInput & { discount: StripeDiscountWithCoupon }) => {
	const periodEndMs = replacedSubscriptionPeriodEndMs({
		replacedStripeSubscription,
	});
	if (!discount.end || periodEndMs === undefined) return 0;

	return remainingDiscountMonths({
		currentEpochMs,
		billingCycleAnchorMs: secondsToMs(
			replacedStripeSubscription.billing_cycle_anchor,
		),
		periodEndMs,
		renewal: subscriptionRenewal(replacedStripeSubscription),
		discountEndMs: secondsToMs(discount.end),
	});
};

/** A repeating coupon restarts its full duration when redeemed again, so a part-used one moves as a copy for the months left. */
const carryDiscount = async ({
	discount,
	...input
}: CarryInput & {
	discount: StripeDiscountWithCoupon;
}): Promise<StripeDiscountWithCoupon | undefined> => {
	const { coupon } = discount.source;
	if (coupon.duration !== "repeating") {
		return redeemAgain({ ...input, discount, coupon });
	}

	const months = repeatingMonthsLeft({ ...input, discount });
	if (months === 0) return undefined;
	if (months === coupon.duration_in_months) {
		return redeemAgain({ ...input, discount, coupon });
	}
	return copyCoupon({ ...input, coupon: remainingCoupon({ coupon, months }) });
};

const couponIdOf = (discount: StripeDiscountWithCoupon) =>
	discount.source.coupon.id;

/**
 * On a recreate the replaced subscription's discounts carry as Stripe would have kept applying them (Stripe drops
 * a spent once discount and an ended repeating one itself), minus `remove_discounts`. As in billing setup, the
 * subscription's own discounts take priority over the customer's, and a requested coupon already carried isn't added twice.
 */
export const carryReplacedSubscriptionDiscounts = async ({
	stripeDiscounts = [],
	removedRewardIds = [],
	...input
}: CarryInput & {
	stripeDiscounts?: StripeDiscountWithCoupon[];
	removedRewardIds?: string[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const replacedDiscounts = removeDiscountsByRewardIds({
		discounts: await subToDiscounts({
			ctx: input.ctx,
			sub: input.replacedStripeSubscription,
		}),
		rewardIds: removedRewardIds,
	});
	const replacedDiscountIds = new Set(
		input.replacedStripeSubscription.discounts.map(stripeRefToId),
	);
	const otherDiscounts = stripeDiscounts.filter(
		(discount) => !discount.id || !replacedDiscountIds.has(discount.id),
	);
	if (replacedDiscounts.length === 0) return otherDiscounts;

	const carried = (
		await Promise.all(
			replacedDiscounts.map((discount) =>
				carryDiscount({ ...input, discount }),
			),
		)
	).filter(
		(discount): discount is StripeDiscountWithCoupon => discount !== undefined,
	);
	const carriedCouponIds = new Set(replacedDiscounts.map(couponIdOf));
	const requested = otherDiscounts.filter(
		(discount) => !discount.id && !carriedCouponIds.has(couponIdOf(discount)),
	);
	return [...carried, ...requested];
};
