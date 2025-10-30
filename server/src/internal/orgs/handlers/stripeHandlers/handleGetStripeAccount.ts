import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "../../orgUtils.js";

export const handleGetStripeAccount = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;

		if (!isStripeConnected({ org, env })) {
			return c.json(null);
		}

		try {
			const stripeCli = createStripeCli({ org, env });
			const accountDetails = await stripeCli.accounts.retrieve();
			return c.json(accountDetails);
		} catch (error) {
			logger.warn(
				`Failed to retrieve Stripe account for org ${org.slug}, ${error}`,
			);
			return c.json(null);
		}
	},
});
