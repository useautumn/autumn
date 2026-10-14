import { getAutumnEnv } from "@autumn/env";
import { AppEnv, ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateOAuthState } from "../utils/oauthStateUtils.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

const GetOAuthUrlSchema = z.object({
	organization_slug: z.string().min(1),
	env: z.enum(["test", "live"]),
	redirect_url: z.string(),
});

export const handleGetPlatformOAuth = createRoute({
	scopes: [Scopes.Platform.Write],
	body: GetOAuthUrlSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger } = ctx;

		const { organization_slug, env, redirect_url } = c.req.valid("json");

		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env: env === "live" ? AppEnv.Live : AppEnv.Sandbox,
			redirectUri: redirect_url,
			masterOrgId: masterOrg.id,
		});

		const clientId =
			env === "live"
				? process.env.STRIPE_LIVE_CLIENT_ID
				: process.env.STRIPE_SANDBOX_CLIENT_ID;

		if (!clientId) {
			throw new RecaseError({
				message: `Stripe ${env} client ID not configured`,
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		const oauthUrl = new URL("https://connect.stripe.com/oauth/v2/authorize");
		oauthUrl.searchParams.set("response_type", "code");
		oauthUrl.searchParams.set("client_id", clientId);
		oauthUrl.searchParams.set("scope", "read_write");
		oauthUrl.searchParams.set("state", stateKey);
		oauthUrl.searchParams.set(
			"redirect_uri",
			`${getAutumnEnv().AUTUMN_PUBLIC_API_URL}/stripe/oauth_callback`,
		);

		logger.info(`Generated OAuth URL for platform org ${org.slug} (${env})`);

		return c.json({
			oauth_url: oauthUrl.toString(),
		});
	},
});
