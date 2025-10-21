import { AppEnv } from "@autumn/shared";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { consumeOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";

/**
 * Handles Stripe OAuth callback
 * Uses Redis state for both standard and platform flows
 */
export const handleOAuthCallback = async (c: Context<HonoEnv>) => {
	const query = c.req.query();
	const { code, state, error } = query;

	// Get database connection
	const { db } = initDrizzle();

	// Build frontend redirect URL (default)
	const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
	let redirectUrl = new URL(`${frontendUrl}`);
	redirectUrl.searchParams.set("tab", "stripe");

	// Handle OAuth error from Stripe
	if (error) {
		redirectUrl.searchParams.set("error", error);
		return c.redirect(redirectUrl.toString());
	}

	// Validate required parameters
	if (!code || !state) {
		redirectUrl.searchParams.set("error", "missing_parameters");
		return c.redirect(redirectUrl.toString());
	}

	try {
		// Consume OAuth state from Redis
		const redisState = await consumeOAuthState({ stateKey: state });

		if (!redisState) {
			redirectUrl.searchParams.set("error", "invalid_state");
			return c.redirect(redirectUrl.toString());
		}

		// Extract state data
		const {
			organization_slug,
			env: envStr,
			redirect_uri,
			master_org_id,
		} = redisState;
		const env = envStr === "live" ? AppEnv.Live : AppEnv.Sandbox;
		const isPlatformFlow = master_org_id !== null;

		// Use redirect URI from state (supports both platform and standard flows)
		redirectUrl = new URL(redirect_uri);

		// Fetch the organization by slug
		const org = await OrgService.getBySlug({ db, slug: organization_slug });

		if (!org) {
			console.error("Organization not found:", organization_slug);
			redirectUrl.searchParams.set("error", "org_not_found");
			return c.redirect(redirectUrl.toString());
		}

		const stripe = initMasterStripe({ env });
		const response = await stripe.oauth.token({
			grant_type: "authorization_code",
			code,
		});

		const accountId = response.stripe_user_id;

		if (!accountId) {
			console.error("Account ID not found");
			redirectUrl.searchParams.set("error", "account_id_not_found");
			return c.redirect(redirectUrl.toString());
		}

		// Check if account ID is already connected to another organization
		const existingOrg = await OrgService.findByStripeAccountId({
			db,
			accountId,
			env,
		});

		if (existingOrg) {
			console.error(
				`Account ${accountId} is already connected to org ${existingOrg.id}`,
			);

			// Platform flow just returns error code
			if (isPlatformFlow) {
				redirectUrl.searchParams.set("error", "account_already_connected");
				return c.redirect(redirectUrl.toString());
			}

			// Standard flow returns detailed error
			const master = createStripeCli({ org: existingOrg, env });
			const account = await master.accounts.retrieve(accountId);
			redirectUrl.searchParams.set("error", "account_already_connected");
			redirectUrl.searchParams.set("account_id", accountId);
			redirectUrl.searchParams.set("account_name", account.company?.name || "");
			redirectUrl.searchParams.set(
				"connected_org_name",
				existingOrg.name || "",
			);
			redirectUrl.searchParams.set(
				"connected_org_slug",
				existingOrg.slug || "",
			);
			return c.redirect(redirectUrl.toString());
		}

		// Update organization with Stripe Connect account
		await OrgService.updateStripeConnect({
			db,
			orgId: org.id,
			accountId,
			env,
		});

		console.log(`Successfully connected Stripe account for org ${org.id}`);

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
