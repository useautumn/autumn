import {
	CouponDurationType,
	RewardType,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

const parseStripeCouponDuration = (coupon: Stripe.Coupon) => {
	let duration_type: CouponDurationType = CouponDurationType.OneOff;
	let duration_value: number = 0;

	if (coupon.duration === "forever") {
		duration_type = CouponDurationType.Forever;
	} else if (coupon.duration === "once") {
		duration_type = CouponDurationType.OneOff;
	} else if (coupon.duration === "repeating") {
		duration_type = CouponDurationType.Months;
		duration_value = coupon.duration_in_months || 0;
	} else {
		duration_type = CouponDurationType.OneOff;
	}

	return {
		duration_type,
		duration_value,
	};
};

export const stripeDiscountToResponse = ({
	discount,
	totalDiscountAmounts,
}: {
	discount: Stripe.Discount;
	totalDiscountAmounts?: Stripe.Invoice.TotalDiscountAmount[];
}) => {
	const d = discount;

	const { duration_type, duration_value } = parseStripeCouponDuration(d.coupon);

	const totalDiscountAmount = totalDiscountAmounts?.find(
		(t) => t.discount === d.id,
	);

	const totalAtmnDiscountAmount = stripeToAtmnAmount({
		amount: totalDiscountAmount?.amount || 0,
		currency: d.coupon?.currency ?? undefined,
	});

	return {
		id: d.coupon?.id,
		name: d.coupon?.name ?? "",
		type: d.coupon?.amount_off
			? RewardType.FixedDiscount
			: RewardType.PercentageDiscount,
		discount_value: d.coupon?.amount_off || d.coupon?.percent_off || 0,
		currency: d.coupon?.currency ?? null,
		start: d.start ?? null,
		end: d.end ?? null,
		// subscription_id: d.subscription ?? null,
		duration_type,
		duration_value,

		total_discount_amount: totalDiscountAmount?.amount
			? totalAtmnDiscountAmount
			: null,
	};
};
