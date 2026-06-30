import { AppEnv, Scopes } from "@autumn/shared";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleGetDefaultStripeAccount = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { env, org } = c.get("ctx");

		return c.json({
			id:
				env === AppEnv.Sandbox
					? (org.test_stripe_connect?.default_account_id ?? null)
					: null,
		});
	},
});
