/**
 * Helper to extract coupon ID from a Stripe discount object.
 * Handles both string and expanded object forms.
 */
export const extractCouponId = (discount: unknown): string | null => {
	if (typeof discount === "string") return discount;
	if (
		discount &&
		typeof discount === "object" &&
		"source" in discount &&
		discount.source &&
		typeof discount.source === "object" &&
		"coupon" in discount.source &&
		discount.source.coupon &&
		typeof discount.source.coupon === "object" &&
		"id" in discount.source.coupon
	) {
		return discount.source.coupon.id as string;
	}
	return null;
};
