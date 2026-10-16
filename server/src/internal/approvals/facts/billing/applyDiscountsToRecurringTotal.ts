import type { StripeDiscountWithCoupon } from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * A recurring total after the coupons that discount every future bill. Only
 * forever, whole-subscription percent coupons count: a temporary or fixed-amount
 * coupon can't hide a raise, so a change under one reads as paid.
 */
export const applyDiscountsToRecurringTotal = ({
	total,
	discounts,
}: {
	total: number;
	discounts: StripeDiscountWithCoupon[];
}): number =>
	discounts
		.reduce((amount, { source: { coupon }, end }) => {
			const discountsEveryBill =
				coupon.duration === "forever" &&
				!end &&
				!coupon.applies_to?.products?.length &&
				Boolean(coupon.percent_off);
			if (!discountsEveryBill) return amount;
			return amount.mul(new Decimal(100).sub(coupon.percent_off ?? 0).div(100));
		}, new Decimal(total))
		.toNumber();
