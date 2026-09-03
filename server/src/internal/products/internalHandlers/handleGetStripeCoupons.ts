import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import {
	findCouponByPromoCode,
	listCouponsWithPromoCodes,
} from "@/external/stripe/coupons";
import { createRoute } from "@/honoMiddlewares/routeHandler";

/**
 * GET /products/stripe_coupons
 * Fetches valid coupons directly from Stripe for the current org, each with the
 * promotion codes attached to it.
 *
 * GET /products/stripe_coupons?code=SUMMER20
 * Exact lookup of the one coupon behind a promotion code, for codes the bulk
 * listing didn't reach. Same response shape, with zero or one coupon.
 */
export const handleGetStripeCoupons = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { org, env, logger } = c.get("ctx");
		const stripeCli = createStripeCli({ org, env });

		const code = c.req.query("code")?.trim();
		if (code) {
			const coupon = await findCouponByPromoCode({ stripeCli, code });
			return c.json({ coupons: coupon ? [coupon] : [] });
		}

		const coupons = await listCouponsWithPromoCodes({
			stripeCli,
			logger,
			orgId: org.id,
		});

		return c.json({ coupons });
	},
});
