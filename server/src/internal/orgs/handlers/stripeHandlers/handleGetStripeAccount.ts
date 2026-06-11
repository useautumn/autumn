import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "../../orgUtils.js";

export const handleGetStripeAccount = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;

		if (!isStripeConnected({ org, env })) {
			return c.json(null);
		}

		try {
			const stripeCli = createStripeCli({ org, env });
			const accountDetails = await stripeCli.accounts.retrieve(null);
			return c.json(accountDetails);
		} catch (error) {
			logger.warn(
				`Failed to retrieve Stripe account for org ${org.slug}, ${error}`,
			);
			return c.json(null);
		}
	},
});
