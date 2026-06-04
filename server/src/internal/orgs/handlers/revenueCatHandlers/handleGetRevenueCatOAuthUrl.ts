import { AppEnv, ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import {
	createRcAuthorizationUrl,
	generateCodeVerifier,
} from "@/external/revenueCat/misc/revenuecatOAuth.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";

export const handleGetRevenueCatOAuthUrl = createRoute({
	scopes: [Scopes.Organisation.Write],
	query: z.object({
		redirect_url: z.string().optional(),
	}),
	handler: async (c) => {
		// Read `migrate` from the raw query — the validated query layer coerces
		// "true"/"false" to booleans, which a z.string() field would reject.
		const { redirect_url, migrate } = c.req.query();
		const ctx = c.get("ctx");
		const { org, env } = ctx;

		if (
			!process.env.REVENUECAT_OAUTH_CLIENT_ID ||
			!process.env.REVENUECAT_OAUTH_CLIENT_SECRET
		) {
			throw new RecaseError({
				message: "RevenueCat OAuth client credentials not configured",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
		const envPrefix = env === AppEnv.Sandbox ? "/sandbox" : "";
		const redirectUri =
			redirect_url || `${frontendUrl}${envPrefix}/dev?tab=revenuecat`;
		const codeVerifier = generateCodeVerifier();

		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env,
			redirectUri,
			masterOrgId: null,
			codeVerifier,
			provider: "revenuecat",
			migration: migrate === "true",
		});

		const authUrl = createRcAuthorizationUrl({
			state: stateKey,
			codeVerifier,
		});

		return c.json({
			oauth_url: authUrl.toString(),
		});
	},
});
