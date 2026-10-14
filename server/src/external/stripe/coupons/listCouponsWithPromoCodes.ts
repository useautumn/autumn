import type { StripeCouponWithPromoCodes } from "@autumn/shared";
import type Stripe from "stripe";
import { getPromoCouponId } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils";

type WarnLogger = { warn: (message: string) => void };

const MAX_PROMOTION_CODES = 1000;

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

export const listCouponsWithPromoCodes = async ({
	stripeCli,
	logger,
	orgId,
}: {
	stripeCli: Stripe;
	logger: WarnLogger;
	orgId: string;
}): Promise<StripeCouponWithPromoCodes[]> => {
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

		const codesByCouponId = await codesByCouponIdPromise;
		coupons.push({
			...coupon,
			promotion_codes: codesByCouponId.get(coupon.id) ?? [],
		});
	}

	return coupons;
};
