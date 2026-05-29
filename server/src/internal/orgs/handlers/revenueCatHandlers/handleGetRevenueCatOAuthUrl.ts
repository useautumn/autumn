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
		const { redirect_url } = c.req.query();
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
		const redirectUri = redirect_url || `${frontendUrl}/dev?tab=revenuecat`;
		const codeVerifier = generateCodeVerifier();

		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env: env === AppEnv.Live ? "live" : "test",
			redirectUri,
			masterOrgId: null,
			codeVerifier,
			provider: "revenuecat",
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
