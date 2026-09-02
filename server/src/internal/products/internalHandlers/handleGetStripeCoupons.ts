import { Scopes } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getPromoCouponId } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils";
import { createRoute } from "@/honoMiddlewares/routeHandler";

/** Upper bound on promotion codes pulled from Stripe, so the list stays fast. */
const MAX_PROMOTION_CODES = 1000;

/**
 * Groups active promotion codes by the coupon they belong to. These are the
 * codes customers actually type, so the dashboard can search coupons by them.
 */
const listPromotionCodesByCoupon = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}) => {
	const codesByCouponId = new Map<string, string[]>();
	let fetched = 0;

	for await (const promotionCode of stripeCli.promotionCodes.list({
		active: true,
		limit: 100,
	})) {
		fetched += 1;

		const couponId = getPromoCouponId(promotionCode);
		if (couponId) {
			const existingCodes = codesByCouponId.get(couponId);
			if (existingCodes) {
				existingCodes.push(promotionCode.code);
			} else {
				codesByCouponId.set(couponId, [promotionCode.code]);
			}
		}

		if (fetched >= MAX_PROMOTION_CODES) break;
	}

	return codesByCouponId;
};

const listValidCoupons = async ({ stripeCli }: { stripeCli: Stripe }) => {
	const validCoupons: Stripe.Coupon[] = [];
	for await (const coupon of stripeCli.coupons.list({ limit: 100 })) {
		if (coupon.valid) {
			validCoupons.push(coupon);
		}
	}
	return validCoupons;
};

/**
 * GET /products/stripe_coupons
 * Fetches valid coupons directly from Stripe for the current org, each with the
 * promotion codes attached to it.
 */
export const handleGetStripeCoupons = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { org, env, logger } = c.get("ctx");

		const stripeCli = createStripeCli({ org, env });

		const [validCoupons, promotionCodesByCoupon] = await Promise.all([
			listValidCoupons({ stripeCli }),
			// Promotion codes are a nice-to-have for search: never fail the list
			// of coupons because they couldn't be fetched.
			listPromotionCodesByCoupon({ stripeCli }).catch((error) => {
				logger.warn(
					`Failed to fetch Stripe promotion codes for org ${org.id}: ${error}`,
				);
				return new Map<string, string[]>();
			}),
		]);

		return c.json({
			coupons: validCoupons.map((coupon) => ({
				...coupon,
				promotion_codes: promotionCodesByCoupon.get(coupon.id) ?? [],
			})),
		});
	},
});
