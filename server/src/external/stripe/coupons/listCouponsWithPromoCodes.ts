import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import type Stripe from "stripe";
import { getPromoCouponId } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils";

/** Upper bound on promotion codes pulled from Stripe, so the listing stays fast. */
const MAX_PROMOTION_CODES = 1000;

/** Groups active promotion codes by the coupon they belong to. */
const listPromoCodesByCoupon = async ({ stripeCli }: { stripeCli: Stripe }) => {
	const codesByCouponId = new Map<string, string[]>();
	let fetched = 0;

	for await (const promoCode of stripeCli.promotionCodes.list({
		active: true,
		limit: 100,
	})) {
		fetched += 1;

		const couponId = getPromoCouponId(promoCode);
		if (couponId) {
			const codes = codesByCouponId.get(couponId);
			if (codes) {
				codes.push(promoCode.code);
			} else {
				codesByCouponId.set(couponId, [promoCode.code]);
			}
		}

		if (fetched >= MAX_PROMOTION_CODES) break;
	}

	return codesByCouponId;
};

/**
 * Lists an org's valid Stripe coupons, each with its active promotion codes.
 * Promotion codes are only there to be searched on, so a failure to fetch them
 * leaves the coupons intact rather than failing the whole listing.
 */
export const listCouponsWithPromoCodes = async ({
	stripeCli,
	logger,
}: {
	stripeCli: Stripe;
	logger: { warn: (message: string) => void };
}): Promise<StripeCouponWithPromoCodes[]> => {
	const codesByCouponId = await listPromoCodesByCoupon({ stripeCli }).catch(
		(error) => {
			logger.warn(`Failed to fetch Stripe promotion codes: ${error}`);
			return new Map<string, string[]>();
		},
	);

	const coupons: StripeCouponWithPromoCodes[] = [];
	for await (const coupon of stripeCli.coupons.list({ limit: 100 })) {
		if (!coupon.valid) continue;

		coupons.push({
			...coupon,
			promotion_codes: codesByCouponId.get(coupon.id) ?? [],
		});
	}

	return coupons;
};
