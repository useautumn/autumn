import {
	AppEnv,
	DisconnectStripeParamsSchema,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { orgToStripeConnect } from "@/external/connect/stripeConnectField.js";
import { clearRevokedStripeConnection } from "@/external/stripe/webhookHandlers/clearRevokedStripeConnection.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { deauthorizeStripeConnection } from "../utils/deauthorizeStripeConnection.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

export const handleDisconnectStripe = createRoute({
	scopes: [Scopes.Platform.Write],
	body: DisconnectStripeParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { organization_slug, env: envParam } = c.req.valid("json");
		const env = envParam === "live" ? AppEnv.Live : AppEnv.Sandbox;

		const org = await validatePlatformOrg({
			db: ctx.db,
			organizationSlug: organization_slug,
			masterOrg: ctx.org,
		});
		const connect = orgToStripeConnect({ org, env });

		if (connect?.master_org_id && connect.account_id) {
			throw new RecaseError({
				message: "Platform-managed Stripe accounts are not OAuth connections",
				statusCode: 400,
			});
		}

		const accountId = connect?.account_id ?? connect?.revoked_account_id;
		if (!accountId) return c.json({ success: true });

		// A pending revocation was already revoked at Stripe; only local cleanup remains.
		if (connect?.account_id) {
			const oauthOrgs = await OrgService.listByDeauthorizedAccount({
				db: ctx.db,
				accountId,
				env,
			});
			const isShared = oauthOrgs.some(
				(other) =>
					other.id !== org.id &&
					orgToStripeConnect({ org: other, env })?.account_id === accountId,
			);
			if (isShared) {
				throw new RecaseError({
					message:
						"This Stripe OAuth account is shared with another organization and cannot be disconnected independently",
					statusCode: 409,
				});
			}

			await deauthorizeStripeConnection({ env, accountId });
		}

		const cleared = await clearRevokedStripeConnection({
			ctx: { ...ctx, org, env },
			accountId,
		});
		if (!cleared) {
			throw new RecaseError({
				message:
					"Stripe connection changed during disconnect; reload and retry",
				statusCode: 409,
			});
		}

		return c.json({ success: true });
	},
});
