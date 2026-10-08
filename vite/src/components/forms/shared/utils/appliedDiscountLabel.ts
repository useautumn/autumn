import { type ApiDiscount, CouponDurationType } from "@autumn/shared";
import { differenceInMonths } from "date-fns";
import { formatDiscountLabel } from "@/views/customers2/components/sheets/subscriptionDetailUtils";

/** Whole months left on a repeating coupon, the same count set_plans carries to a recreated subscription. */
const monthsLeftText = ({
	discount,
	nowMs,
}: {
	discount: ApiDiscount;
	nowMs: number;
}): string | null => {
	if (discount.duration_type !== CouponDurationType.Months) return null;
	if (discount.end == null) return null;

	const months = differenceInMonths(discount.end, nowMs);
	if (months <= 0) return "ends this period";
	return `${months} ${months === 1 ? "month" : "months"} left`;
};

export const appliedDiscountLabel = ({
	discount,
	nowMs,
}: {
	discount: ApiDiscount;
	nowMs: number;
}): string =>
	[formatDiscountLabel({ discount }), monthsLeftText({ discount, nowMs })]
		.filter(Boolean)
		.join(" · ");
