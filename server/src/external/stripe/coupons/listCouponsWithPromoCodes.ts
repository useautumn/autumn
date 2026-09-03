import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import type Stripe from "stripe";
import { getPromoCouponId } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils";

type WarnLogger = { warn: (message: string) => void };

/** Upper bound on promotion codes pulled from Stripe, so the listing stays fast. */
const MAX_PROMOTION_CODES = 1000;

/** Groups active promotion codes by the coupon they belong to. */
const listPromoCodesByCoupon = async ({
	stripeCli,
	logger,
	orgId,
}: {
	stripeCli: Stripe;
	logger: WarnLogger;
	orgId: string;
}) => {
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

		if (fetched >= MAX_PROMOTION_CODES) {
			logger.warn(
				`Stopped listing Stripe promotion codes for org ${orgId} at ${MAX_PROMOTION_CODES}; coupons past this point won't be searchable by code`,
			);
			break;
		}
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
	orgId,
}: {
	stripeCli: Stripe;
	logger: WarnLogger;
	orgId: string;
}): Promise<StripeCouponWithPromoCodes[]> => {
	// Started before the coupon listing so the two paginate in parallel.
	const codesByCouponIdPromise = listPromoCodesByCoupon({
		stripeCli,
		logger,
		orgId,
	}).catch((error) => {
		logger.warn(
			`Failed to fetch Stripe promotion codes for org ${orgId}: ${error}`,
		);
		return new Map<string, string[]>();
	});

	const coupons: StripeCouponWithPromoCodes[] = [];
	for await (const coupon of stripeCli.coupons.list({ limit: 100 })) {
		if (!coupon.valid) continue;

		// Already in flight, so only the first valid coupon can actually wait.
		const codesByCouponId = await codesByCouponIdPromise;
		coupons.push({
			...coupon,
			promotion_codes: codesByCouponId.get(coupon.id) ?? [],
		});
	}

	return coupons;
};
