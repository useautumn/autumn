import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import { RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { resolvePromotionCode } from "./resolvePromotionCode";

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
