import {
	AppEnv,
	DisconnectStripeParamsSchema,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { clearRevokedStripeConnection } from "@/external/stripe/webhookHandlers/clearRevokedStripeConnection.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deauthorizeStripeConnection } from "../utils/deauthorizeStripeConnection.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

export const handleDisconnectStripe = createRoute({
	scopes: [Scopes.Platform.Write],
	body: DisconnectStripeParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { organization_slug, env } = c.req.valid("json");
		const org = await validatePlatformOrg({
			db: ctx.db,
			organizationSlug: organization_slug,
			masterOrg: ctx.org,
		});
		const appEnv = env === "live" ? AppEnv.Live : AppEnv.Sandbox;
		const connect =
			appEnv === AppEnv.Live
				? org.live_stripe_connect
				: org.test_stripe_connect;
		if (connect?.master_org_id && connect.account_id)
			throw new RecaseError({
				message: "Platform-managed Stripe accounts are not OAuth connections",
				statusCode: 400,
			});
		const accountId = connect?.account_id ?? connect?.revoked_account_id;
		if (!accountId) return c.json({ success: true });
		const cleared = await clearRevokedStripeConnection({
			ctx: { ...ctx, org, env: appEnv },
			accountId,
			deauthorize: ({ db, org: currentOrg }) =>
				deauthorizeStripeConnection({
					ctx: { ...ctx, db, org: currentOrg, env: appEnv },
					accountId,
				}),
		});
		if (!cleared)
			throw new RecaseError({
				message:
					"Stripe connection changed during disconnect; reload and retry",
				statusCode: 409,
			});
		return c.json({ success: true });
	},
});
