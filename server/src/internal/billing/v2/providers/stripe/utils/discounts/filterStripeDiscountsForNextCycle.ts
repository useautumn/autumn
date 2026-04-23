import {
	formatMs,
	formatSeconds,
	type StripeDiscountWithCoupon,
	secondsToMs,
} from "@autumn/shared";
import { addMonths } from "date-fns";

/**
 * Keeps only discounts that are still active when the next cycle starts.
 */
export const filterStripeDiscountsForNextCycle = ({
	stripeDiscounts,
	currentEpochMs,
	nextCycleStart,
}: {
	stripeDiscounts: StripeDiscountWithCoupon[];
	currentEpochMs: number;
	nextCycleStart: number;
}) => {
	return stripeDiscounts.filter((discount) =>
		stripeDiscountAppliesToNextCycle({
			discount,
			currentEpochMs,
			nextCycleStart,
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
}: {
	discount: StripeDiscountWithCoupon;
	currentEpochMs: number;
	nextCycleStart: number;
}) => {
	console.log("Discount:", {
		id: discount.id,
		end: formatSeconds(discount.end),
	});
	console.log("Next cycle start:", formatMs(nextCycleStart));

	const { coupon } = discount.source;

	if (coupon.duration === "once") {
		return false;
	}

	if (coupon.duration === "forever") {
		return true;
	}

	if (coupon.duration === "repeating") {
		// Existing discounts have Stripe's own `end` populated — trust it.
		if (discount.end != null) {
			return secondsToMs(discount.end) > nextCycleStart;
		}

		// Fresh repeating discount without an id: compute end from now.
		const durationInMonths = coupon.duration_in_months ?? 0;
		if (durationInMonths <= 0) return false;

		const freshDiscountEndsAt = addMonths(
			new Date(currentEpochMs),
			durationInMonths,
		).getTime();

		return freshDiscountEndsAt > nextCycleStart;
	}

	return false;
};
