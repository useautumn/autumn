import { notNullish, type StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Extracts discounts from a Stripe subscription.
 *
 * When any discount has a deleted coupon, the new API's `source.coupon` only
 * returns `{ id, deleted: true }` with no percent_off / amount_off. To recover
 * the full coupon data we re-fetch the subscription via the legacy Stripe API
 * (2025-02-24.acacia), which exposes discounts under `discount.coupon` with all
 * original fields intact even after deletion.
 */
export const subToDiscounts = async ({
	ctx,
	sub,
}: {
	ctx: AutumnContext;
	sub?: Stripe.Subscription;
}): Promise<StripeDiscountWithCoupon[]> => {
	if (!sub) return [];

	// Detect whether any discount has a deleted coupon.
	const hasDeletedCoupon = sub.discounts.some((discount) => {
		if (typeof discount === "string") return false;
		const coupon = discount.source?.coupon;
		return (
			coupon &&
			typeof coupon !== "string" &&
			"deleted" in coupon &&
			coupon.deleted
		);
	});

	// If deleted coupons exist, re-fetch the subscription via the legacy API which
	// exposes discounts under `discount.coupon` with all original fields intact.
	const deletedCouponMap = new Map<string, Stripe.Coupon>();
	if (hasDeletedCoupon) {
		const legacyStripeCli = createStripeCli({
			org: ctx.org,
			env: ctx.env,
			legacyVersion: true,
		});
		const legacySub = await legacyStripeCli.subscriptions.retrieve(sub.id, {
			expand: ["discounts.coupon"],
		});

		for (const discount of legacySub.discounts) {
			if (typeof discount === "string") continue;
			const coupon = (discount as unknown as { coupon?: Stripe.Coupon }).coupon;
			if (coupon && typeof coupon !== "string") {
				deletedCouponMap.set(discount.id, coupon);
			}
		}
	}

	return sub.discounts
		.map((discount) => {
			if (typeof discount === "string") return null;

			// Stripe discount has coupon under source.coupon (when expanded)
			const coupon = discount.source?.coupon;
			if (!coupon || typeof coupon === "string") return null;

			// Hydrate deleted coupons with full data from the legacy fetch.
			// Fall back to including the discount as-is if not in the map, so it
			// is still carried over via { discount: id } in stripeDiscountsToParams.
			if ("deleted" in coupon && coupon.deleted) {
				const fullCoupon = deletedCouponMap.get(discount.id);
				if (!fullCoupon) return discount as StripeDiscountWithCoupon;
				return {
					...discount,
					source: { ...discount.source, coupon: fullCoupon },
				} as StripeDiscountWithCoupon;
			}

			return discount as StripeDiscountWithCoupon;
		})
		.filter(notNullish);
};
