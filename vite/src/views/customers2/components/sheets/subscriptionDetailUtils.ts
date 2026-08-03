import type { ApiDiscount } from "@autumn/shared";

export function formatDiscountLabel({
	discount,
}: {
	discount: ApiDiscount;
}): string {
	const value =
		discount.type === "percentage_discount"
			? `${discount.discount_value}% off`
			: `${discount.discount_value} ${discount.currency?.toUpperCase() ?? ""} off`;

	return discount.name ? `${discount.name} (${value})` : value;
}
