import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { resolvePromotionCode } from "./resolvePromotionCode";

/**
 * Looks up the valid coupon behind one promotion code. Stripe indexes codes,
 * so this is a single cheap call however many codes the org has — the
 * fallback for codes the bulk listing didn't reach. Null when the code
 * doesn't exist, is inactive, or its coupon is no longer valid.
 */
export const findCouponByPromoCode = async ({
	stripeCli,
	code,
}: {
	stripeCli: Stripe;
	code: string;
}): Promise<StripeCouponWithPromoCodes | null> => {
	try {
		const discount = await resolvePromotionCode({ stripeCli, code });
		return { ...discount.source.coupon, promotion_codes: [code] };
	} catch (error) {
		if (error instanceof RecaseError) return null;
		throw error;
	}
};
