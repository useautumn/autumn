import {
	type StripeDiscountWithCoupon,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * A recurring total after the customer's coupons. Product-scoped coupons are
 * skipped, so the comparison only ever errs toward calling a change paid.
 */
export const applyDiscountsToRecurringTotal = ({
	total,
	discounts,
	currency,
}: {
	total: number;
	discounts: StripeDiscountWithCoupon[];
	currency: string;
}): number =>
	discounts
		.reduce((amount, { source: { coupon } }) => {
			if (coupon.applies_to?.products?.length) return amount;
			if (coupon.percent_off) {
				return amount.mul(new Decimal(100).sub(coupon.percent_off).div(100));
			}
			if (coupon.amount_off) {
				const amountOff = stripeToAtmnAmount({
					amount: coupon.amount_off,
					currency: coupon.currency ?? currency,
				});
				return Decimal.max(amount.sub(amountOff), 0);
			}
			return amount;
		}, new Decimal(total))
		.toNumber();
