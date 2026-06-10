import { type StripeDiscountWithCoupon, secondsToMs } from "@autumn/shared";
import { addMonths } from "date-fns";

/**
 * Keeps only discounts that are still active when the next cycle starts.
 */
export const filterStripeDiscountsForNextCycle = ({
	stripeDiscounts,
	currentEpochMs,
	nextCycleStart,
	discountStartMs,
	hasImmediateInvoice = true,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
	currentEpochMs: number;
	nextCycleStart: number;
	discountStartMs?: number;
	hasImmediateInvoice?: boolean;
}) => {
	return stripeDiscounts.filter((discount) =>
		stripeDiscountAppliesToNextCycle({
			discount,
			currentEpochMs,
			nextCycleStart,
			discountStartMs,
			hasImmediateInvoice,
		}),
	);
};

/**
 * Checks whether a Stripe discount should affect next-cycle preview charges.
 */
const stripeDiscountAppliesToNextCycle = ({
	discount,
	currentEpochMs,
	nextCycleStart,
	discountStartMs,
	hasImmediateInvoice,
}: {
	discount: StripeDiscountWithCoupon;
	currentEpochMs: number;
	nextCycleStart: number;
	discountStartMs?: number;
	hasImmediateInvoice: boolean;
}) => {
	if (discount.id) {
		if (discount.end == null) return true;
		return secondsToMs(discount.end) > nextCycleStart;
	}

	const { coupon } = discount.source;

	if (coupon.duration === "forever") {
		return true;
	}

	if (coupon.duration === "once") {
		// A fresh once coupon hits the first invoice after it's applied — when
		// nothing is invoiced immediately, that first invoice is the next cycle's.
		return !hasImmediateInvoice;
	}

	if (coupon.duration === "repeating") {
		const durationInMonths = coupon.duration_in_months ?? 0;
		if (durationInMonths <= 0) return false;

		const freshDiscountEndsAt = addMonths(
			new Date(discountStartMs ?? currentEpochMs),
			durationInMonths,
		).getTime();

		return freshDiscountEndsAt > nextCycleStart;
	}

	return false;
};
