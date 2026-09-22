import {
	type ApiDiscount,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { UpdateSubscriptionForm } from "@/components/forms/update-subscription-v2";
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

export function getPendingBillingCycleAnchor({
	cusProduct,
	nowMs,
}: {
	cusProduct: FullCusProduct;
	nowMs: number;
}): number | null {
	const resetsAt = cusProduct.billing_cycle_anchor_resets_at;
	if (typeof resetsAt !== "number" || resetsAt <= nowMs) return null;
	if (cusProduct.status === CusProductStatus.Expired) return null;
	return resetsAt;
}

export function billingCycleAnchorFormOverrides({
	resetsAt,
}: {
	resetsAt: number;
}): Pick<
	UpdateSubscriptionForm,
	"resetBillingCycle" | "billingCycleAnchorMode" | "billingCycleAnchorDate"
> {
	return {
		resetBillingCycle: true,
		billingCycleAnchorMode: "custom",
		billingCycleAnchorDate: resetsAt,
	};
}
