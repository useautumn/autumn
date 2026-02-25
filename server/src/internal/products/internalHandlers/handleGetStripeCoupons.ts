import { createStripeCli } from "@/external/connect/createStripeCli";
import { createRoute } from "@/honoMiddlewares/routeHandler";

/**
 * GET /products/stripe_coupons
 * Fetches valid coupons directly from Stripe for the current org.
 */
export const handleGetStripeCoupons = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");

		const stripeCli = createStripeCli({ org, env });
		const coupons = await stripeCli.coupons.list({ limit: 100 });
		const validCoupons = coupons.data.filter((coupon) => coupon.valid);
		return c.json({ coupons: validCoupons });
	},
});
