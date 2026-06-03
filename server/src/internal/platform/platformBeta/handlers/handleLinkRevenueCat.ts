import {
	AppEnv,
	ErrCode,
	LinkRevenueCatSchema,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import {
	createRcAuthorizationUrl,
	generateCodeVerifier,
} from "@/external/revenueCat/misc/revenuecatOAuth.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateOAuthState } from "../utils/oauthStateUtils.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

/**
 * POST /platform.link_revenuecat
 * Generates RevenueCat OAuth URL for a platform-managed organization.
 */
export const handleLinkRevenueCat = createRoute({
	scopes: [Scopes.Platform.Write],
	body: LinkRevenueCatSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger } = ctx;

		const { organization_slug, env, project_name, redirect_url } =
			c.req.valid("json");

		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		const rcConfig = org.processor_configs?.revenuecat;
		const isLinked =
			env === "live"
				? !!(rcConfig?.oauth || rcConfig?.project_id || rcConfig?.api_key)
				: !!(
						rcConfig?.sandbox_oauth ||
						rcConfig?.sandbox_project_id ||
						rcConfig?.sandbox_api_key
					);

		if (isLinked) {
			throw new RecaseError({
				message: `RevenueCat already linked for ${env} environment`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const codeVerifier = generateCodeVerifier();
		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env: env === "live" ? AppEnv.Live : AppEnv.Sandbox,
			redirectUri: redirect_url,
			masterOrgId: masterOrg.id,
			codeVerifier,
			provider: "revenuecat",
			revenuecatProjectName: project_name,
		});

		const authUrl = createRcAuthorizationUrl({
			state: stateKey,
			codeVerifier,
		});

		logger.info(
			`Generated RevenueCat OAuth URL for platform org ${org.slug} (${env})`,
		);

		return c.json({
			oauth_url: authUrl.toString(),
		});
	},
});
