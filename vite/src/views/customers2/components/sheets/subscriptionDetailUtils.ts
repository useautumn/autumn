import type { ApiDiscount } from "@autumn/shared";
import { formatAmountWithCurrencyPrecision } from "@/utils/formatUtils/formatCurrencyUtils";

export function formatDiscountLabel({
	discount,
}: {
	discount: ApiDiscount;
}): string {
	const value =
		discount.type === "percentage_discount"
			? `${discount.discount_value}% off`
			: `${formatAmountWithCurrencyPrecision({
					amount: discount.discount_value,
					currency: discount.currency,
				})} off`;

	return discount.name ? `${discount.name} (${value})` : value;
}
