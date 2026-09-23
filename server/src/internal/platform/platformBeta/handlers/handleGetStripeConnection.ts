import {
	AppEnv,
	GetStripeConnectionParamsSchema,
	Scopes,
} from "@autumn/shared";
import { orgToStripeConnect } from "@/external/connect/stripeConnectField.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

export const handleGetStripeConnection = createRoute({
	scopes: [Scopes.Platform.Read],
	body: GetStripeConnectionParamsSchema,
	handler: async (c) => {
		const { db, org: masterOrg } = c.get("ctx");
		const { organization_slug, env } = c.req.valid("json");

		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});
		const connect = orgToStripeConnect({
			org,
			env: env === "live" ? AppEnv.Live : AppEnv.Sandbox,
		});

		// Managed links belong to the platform's own Stripe app, not Autumn OAuth.
		const accountId = connect?.master_org_id ? null : connect?.account_id;
		if (!accountId) {
			return c.json({ connected: false, account_id: null, connected_at: null });
		}

		return c.json({
			connected: true,
			account_id: accountId,
			connected_at: connect?.connected_at ?? null,
		});
	},
});
