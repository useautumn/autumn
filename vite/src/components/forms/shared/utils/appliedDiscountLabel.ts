import type { ApiDiscount } from "@autumn/shared";
import { formatDiscountLabel } from "@/views/customers2/components/sheets/subscriptionDetailUtils";

/** A discount on the subscription; `months_left` is the server's carried count when it sent one. */
export type AppliedDiscount = ApiDiscount & { months_left?: number | null };

const monthsLeftText = (monthsLeft: number) => {
	if (monthsLeft === 0) return "ends this period";
	return `${monthsLeft} ${monthsLeft === 1 ? "month" : "months"} left`;
};

export const appliedDiscountLabel = ({
	discount,
}: {
	discount: AppliedDiscount;
}): string => {
	const label = formatDiscountLabel({ discount });
	if (discount.months_left == null) return label;
	return `${label} · ${monthsLeftText(discount.months_left)}`;
};
