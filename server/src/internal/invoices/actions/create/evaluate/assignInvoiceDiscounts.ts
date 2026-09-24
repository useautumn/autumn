import {
	ErrCode,
	RecaseError,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";

export type DiscountableLine = { lineId: string; planKey: string };

export type AssignedInvoiceDiscounts = {
	invoiceCouponIds: string[];
	lineCouponIds: Record<string, string[]>;
};

/**
 * Invoice-level discounts ride on the invoice; a plan's discounts ride on each
 * of that plan's lines. A fixed-amount coupon over several lines would be taken
 * once per line, so it is refused rather than split.
 */
export const assignInvoiceDiscounts = ({
	lines,
	invoiceDiscounts,
	planDiscounts,
}: {
	lines: DiscountableLine[];
	invoiceDiscounts: StripeDiscountWithCoupon[];
	planDiscounts: Record<string, StripeDiscountWithCoupon[]>;
}): AssignedInvoiceDiscounts => {
	const lineCouponIds: Record<string, string[]> = {};

	for (const [planKey, discounts] of Object.entries(planDiscounts)) {
		const planLines = lines.filter((line) => line.planKey === planKey);
		if (planLines.length === 0 || discounts.length === 0) continue;

		for (const discount of discounts) {
			const coupon = discount.source.coupon;
			if (coupon.amount_off && planLines.length > 1) {
				throw new RecaseError({
					message: `Fixed-amount discount ${coupon.id} cannot be applied to plan ${planKey}: it generates ${planLines.length} lines. Apply it at the invoice level instead.`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			for (const line of planLines) {
				lineCouponIds[line.lineId] = [
					...(lineCouponIds[line.lineId] ?? []),
					coupon.id,
				];
			}
		}
	}

	return {
		invoiceCouponIds: invoiceDiscounts.map(
			(discount) => discount.source.coupon.id,
		),
		lineCouponIds,
	};
};
