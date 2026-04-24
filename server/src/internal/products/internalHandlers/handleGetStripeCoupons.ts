import { createStripeCli } from "@/external/connect/createStripeCli";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";

/**
 * GET /products/stripe_coupons
 * Fetches valid coupons directly from Stripe for the current org.
 */
export const handleGetStripeCoupons = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { org, env } = c.get("ctx");

		const stripeCli = createStripeCli({ org, env });
		const validCoupons = [];
		for await (const coupon of stripeCli.coupons.list({ limit: 100 })) {
			if (coupon.valid) {
				validCoupons.push(coupon);
			}
		}
		return c.json({ coupons: validCoupons });
	},
});
