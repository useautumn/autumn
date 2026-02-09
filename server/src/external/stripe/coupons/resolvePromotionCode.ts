import { RecaseError } from "@autumn/shared";
import type { StripeDiscountWithCoupon } from "@shared/models/billingModels/stripe/stripeDiscountWithCoupon";
import type Stripe from "stripe";

/**
 * Resolves a human-readable promotion code string to a StripeDiscountWithCoupon.
 * Validates that the promotion code exists, is active, and its coupon is valid.
 * Stores the promotion code ID for proper attribution in checkout sessions.
 */
export const resolvePromotionCode = async ({
	stripeCli,
	code,
}: {
	stripeCli: Stripe;
	code: string;
}): Promise<StripeDiscountWithCoupon> => {
	try {
		const promos = await stripeCli.promotionCodes.list({
			code,
			active: true,
			limit: 1,
			expand: ["data.promotion.coupon"],
		});

		if (promos.data.length === 0) {
			throw new RecaseError({
				message: `Promotion code not found or inactive: "${code}"`,
			});
		}

		const promo = promos.data[0];
		const couponRaw = promo.promotion.coupon;

		if (!couponRaw || typeof couponRaw === "string") {
			throw new RecaseError({
				message: `Could not resolve coupon for promotion code "${code}"`,
			});
		}

		if (!couponRaw.valid) {
			throw new RecaseError({
				message: `Coupon for promotion code "${code}" is no longer valid`,
			});
		}

		return {
			source: { coupon: couponRaw },
			promotionCodeId: promo.id,
		};
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		throw new RecaseError({
			message: `Invalid promotion code: "${code}"`,
		});
	}
};
