import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";

export const handleGetOAuthUrl = createRoute({
	query: z.object({
		redirect_url: z.string().optional(),
	}),
	handler: async (c) => {
		const { redirect_url } = c.req.query();
		const ctx = c.get("ctx");
		const { org, env } = ctx;

		const clientId =
			env === AppEnv.Live
				? process.env.STRIPE_LIVE_CLIENT_ID
				: process.env.STRIPE_SANDBOX_CLIENT_ID;

		if (!clientId) {
			throw new RecaseError({
				message: `Stripe ${env === AppEnv.Live ? "live" : "test"} client ID not configured`,
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		// Generate OAuth state and store in Redis
		const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";

		const redirectUri = redirect_url || `${frontendUrl}/dev?tab=stripe`;

		const stateKey = await generateOAuthState({
			organizationSlug: org.slug,
			env: env === AppEnv.Live ? "live" : "test",
			redirectUri,
			masterOrgId: null, // null for standard flow
		});

		const baseUrl = new URL(
			`https://connect.stripe.com/oauth/v2/authorize?response_type=code&client_id=${clientId}&scope=read_write`,
		);

		let serverUrl = process.env.BETTER_AUTH_URL;
		if (env === AppEnv.Live && serverUrl?.includes("localhost")) {
			serverUrl = `https://express.dev.useautumn.com`;
		}

		// Add state + redirect_uri
		baseUrl.searchParams.set("state", stateKey);
		baseUrl.searchParams.set(
			"redirect_uri",
			`${serverUrl}/stripe/oauth_callback`,
		);

		return c.json({
			oauth_url: baseUrl.toString(),
		});
	},
});
