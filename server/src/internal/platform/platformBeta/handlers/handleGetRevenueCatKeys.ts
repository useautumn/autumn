import { AppEnv, GetRevenueCatKeysSchema, Scopes } from "@autumn/shared";
import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
	refreshRevenuecatOAuthAccessToken,
} from "@/external/revenueCat/misc/getRevenuecatAccessToken.js";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

// The stores a managed org's mobile apps actually ship against.
const KEY_APP_TYPES = new Set(["test_store", "app_store", "play_store"]);

/**
 * POST /platform.get_revenuecat_keys — return a managed org's RevenueCat public
 * (SDK) API keys per app, for the test store / App Store / Play Store.
 */
export const handleGetRevenueCatKeys = createRoute({
	scopes: [Scopes.Platform.Write],
	body: GetRevenueCatKeysSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg } = ctx;
		const { organization_slug, env } = c.req.valid("json");
		const appEnv = env === "live" ? AppEnv.Live : AppEnv.Sandbox;

		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		const revenueCatConfig = org.processor_configs?.revenuecat;
		if (!revenueCatConfig) return c.json({ apps: [], oauth_access_token: null });

		const projectId = getRevenuecatProjectId({ revenueCatConfig, env: appEnv });
		// Force-refresh the OAuth token so the master gets a fresh, full-lifetime access token.
		// We keep the rotated refresh token; only the access token is ever handed out.
		const oauthAccessToken = await refreshRevenuecatOAuthAccessToken({
			db,
			org,
			env: appEnv,
		});
		// api-key orgs have no OAuth token — fall back to the api key for the CLI only.
		const accessToken =
			oauthAccessToken ??
			(await getRevenuecatAccessToken({ db, org, env: appEnv }));
		if (!projectId || !accessToken) {
			return c.json({ apps: [], oauth_access_token: null });
		}

		const rcCli = initRevenuecatCli({ projectId, accessToken });
		const apps = (await rcCli.listApps()).filter((app) =>
			KEY_APP_TYPES.has(app.type),
		);

		const result = await Promise.all(
			apps.map(async (app) => ({
				app_id: app.id,
				app_type: app.type,
				name: app.name,
				api_keys: await rcCli.listAppPublicApiKeys(app.id),
			})),
		);

		return c.json({ apps: result, oauth_access_token: oauthAccessToken });
	},
});
