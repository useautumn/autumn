import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateOAuthState } from "../utils/oauthStateUtils.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

const GetOAuthUrlSchema = z.object({
	organization_slug: z.string().min(1),
	env: z.enum(["test", "live"]),
	redirect_url: z.string(),
});

/**
 * POST /oauth_url
 * Generates Stripe OAuth URL for platform organizations
 * - Validates organization ownership
 * - Generates secure state key stored in Redis
 * - Returns OAuth URL with state
 */
export const handleGetPlatformOAuth = createRoute({
	body: GetOAuthUrlSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger } = ctx;

		const { organization_slug, env, redirect_url } = c.req.valid("json");

		// Verify the organization exists and was created by this master org
		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		// Generate OAuth state and store in Redis
		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env,
			redirectUri: redirect_url,
			masterOrgId: masterOrg.id,
		});

		// Get appropriate Stripe client ID based on environment
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

		// Build OAuth URL
		const oauthUrl = new URL("https://connect.stripe.com/oauth/v2/authorize");
		oauthUrl.searchParams.set("response_type", "code");
		oauthUrl.searchParams.set("client_id", clientId);
		oauthUrl.searchParams.set("scope", "read_write");
		oauthUrl.searchParams.set("state", stateKey);
		oauthUrl.searchParams.set(
			"redirect_uri",
			`${process.env.BETTER_AUTH_URL || "https://express.dev.useautumn.com"}/stripe/oauth_callback`,
		);

		logger.info(`Generated OAuth URL for platform org ${org.slug} (${env})`);

		return c.json({
			oauth_url: oauthUrl.toString(),
		});
	},
});
