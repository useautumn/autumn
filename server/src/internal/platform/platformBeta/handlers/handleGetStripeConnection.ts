import {
	AppEnv,
	GetStripeConnectionParamsSchema,
	Scopes,
} from "@autumn/shared";
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
		const appEnv = env === "live" ? AppEnv.Live : AppEnv.Sandbox;
		const connect =
			appEnv === AppEnv.Live
				? org.live_stripe_connect
				: org.test_stripe_connect;
		const accountId = connect?.master_org_id
			? null
			: (connect?.account_id ?? null);
		return c.json({
			connected: Boolean(accountId),
			account_id: accountId,
			connected_at: accountId ? (connect?.connected_at ?? null) : null,
		});
	},
});
