import { Scopes } from "@autumn/shared";
import { initMasterStripe } from "@/external/connect/initStripeCli";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleGetMasterStripeAccount = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { env, logger } = ctx;

		try {
			const masterStripe = initMasterStripe({ env });
			const account = await masterStripe.accounts.retrieve(null);

			return c.json({
				id: account.id,
			});
		} catch (error) {
			logger.warn(`Failed to get master Stripe account: ${error}`);
			return c.json(null);
		}
	},
});
