import { AppEnv, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { initMasterStripe } from "@/external/connect/initMasterStripe.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "../../orgUtils/clearOrgCache.js";

export const handleGetOAuthUrl = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const baseUrl = new URL(
			`https://connect.stripe.com/oauth/v2/authorize?response_type=code&client_id=${process.env.STRIPE_CLIENT_ID}&scope=read_write`,
		);

		// Add state + redirect_uri
		baseUrl.searchParams.set("state", `${org.id}|${ctx.env}`);
		// baseUrl.searchParams.set(
		// 	"redirect_uri",
		// 	`${process.env.BETTER_AUTH_URL}/stripe/oauth_callback`,
		// );
		baseUrl.searchParams.set(
			"redirect_uri",
			`https://express.dev.useautumn.com/stripe/oauth_callback`,
		);

		return c.json({
			oauth_url: baseUrl.toString(),
		});
	},
});

export const handleOAuthCallback = async (c: Context<HonoEnv>) => {
	const query = c.req.query();
	const { code, state, error } = query;

	// Build frontend redirect URL
	const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
	const redirectUrl = new URL(`${frontendUrl}/developer/configure-stripe`);

	// Handle OAuth error from Stripe
	if (error) {
		console.error("Stripe OAuth error:", error);
		redirectUrl.searchParams.set("error", error);
		return c.redirect(redirectUrl.toString());
	}

	// Validate required parameters
	if (!code || !state) {
		console.error("Missing code or state parameter");
		redirectUrl.searchParams.set("error", "missing_parameters");
		return c.redirect(redirectUrl.toString());
	}

	// Parse state to get orgId and env
	const [orgId, env] = state.split("|");

	if (!orgId || !env) {
		console.error("Invalid state format");
		redirectUrl.searchParams.set("error", "invalid_state");
		return c.redirect(redirectUrl.toString());
	}

	console.log(`Org ID: ${orgId}, Env: ${env}, Code: ${code}`);

	try {
		const stripe = initMasterStripe();

		// Exchange authorization code for access token
		const response = await stripe.oauth.token({
			grant_type: "authorization_code",
			code,
		});

		const accountId = response.stripe_user_id;
		console.log("Connected Stripe account:", accountId);

		// Get database connection
		const { db } = initDrizzle();

		// Fetch the organization
		const [org] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.id, orgId));

		if (!org) {
			console.error("Organization not found:", orgId);
			redirectUrl.searchParams.set("error", "org_not_found");
			return c.redirect(redirectUrl.toString());
		}

		// Update organization with connected account based on environment
		const currentConnect = org.stripe_connect || {
			default_account_id: "",
			test_account_id: undefined,
			live_account_id: undefined,
		};

		const updatedStripeConnect = {
			...currentConnect,
			[env === AppEnv.Sandbox ? "test_account_id" : "live_account_id"]:
				accountId,
		};

		await db
			.update(organizations)
			.set({
				stripe_connect: updatedStripeConnect,
			})
			.where(eq(organizations.id, orgId));

		// Clear organization cache
		await clearOrgCache({ db, orgId });

		console.log(`Successfully connected Stripe account for org ${orgId}`);

		// Redirect to success
		redirectUrl.searchParams.set("success", "true");
		return c.redirect(redirectUrl.toString());
	} catch (error: unknown) {
		console.error("Error in OAuth callback:", error);
		redirectUrl.searchParams.set(
			"error",
			error instanceof Error ? error.message : "unknown_error",
		);
		return c.redirect(redirectUrl.toString());
	}
};
