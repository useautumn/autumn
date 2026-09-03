import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { listCouponsWithPromoCodes } from "@/external/stripe/coupons";
import { createRoute } from "@/honoMiddlewares/routeHandler";

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
		const coupons = await listCouponsWithPromoCodes({
			stripeCli,
			logger,
			orgId: org.id,
		});

		return c.json({ coupons });
	},
});
