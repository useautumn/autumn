import type Stripe from "stripe";
import type { ApiDiscount } from "../../../api/others/apiDiscount";
import type { StripeDiscountWithCoupon } from "../../../models/billingModels/stripe/stripeDiscountWithCoupon";
import {
	CouponDurationType,
	RewardType,
} from "../../../models/rewardModels/rewardModels/rewardEnums";
import { secondsToMs } from "../../common/unixUtils";
import { stripeToAtmnAmount } from "../../productUtils/priceUtils/convertAmountUtils";

const STRIPE_DURATION_TO_API: Record<
	Stripe.Coupon.Duration,
	CouponDurationType
> = {
	once: CouponDurationType.OneOff,
	repeating: CouponDurationType.Months,
	forever: CouponDurationType.Forever,
};

/** A subscription's Stripe discount as the API describes it; `id` is the coupon id, which `remove_discounts` takes. */
export const stripeDiscountToApiDiscount = ({
	discount,
	subscriptionId,
}: {
	discount: StripeDiscountWithCoupon;
	subscriptionId?: string;
}): ApiDiscount => {
	const { coupon } = discount.source;
	const isPercent = coupon.percent_off != null;
	return {
		id: coupon.id,
		name: coupon.name ?? coupon.id,
		type: isPercent ? RewardType.PercentageDiscount : RewardType.FixedDiscount,
		discount_value: isPercent
			? (coupon.percent_off ?? 0)
			: stripeToAtmnAmount({
					amount: coupon.amount_off ?? 0,
					currency: coupon.currency ?? undefined,
				}),
		duration_type: STRIPE_DURATION_TO_API[coupon.duration],
		duration_value: coupon.duration_in_months,
		currency: coupon.currency,
		start: discount.start ? secondsToMs(discount.start) : null,
		end: discount.end ? secondsToMs(discount.end) : null,
		subscription_id: subscriptionId,
	};
};
