import type { ApiDiscount } from "@autumn/shared";
import { formatAmount } from "@autumn/shared";

export function formatDiscountLabel({
	discount,
}: {
	discount: ApiDiscount;
}): string {
	const value =
		discount.type === "percentage_discount"
			? `${discount.discount_value}% off`
			: `${formatAmount({
					amount: discount.discount_value,
					currency: discount.currency,
					minFractionDigits: 2,
					maxFractionDigits: 2,
				})} off`;

	return discount.name ? `${discount.name} (${value})` : value;
}
