import { AppEnv } from "@autumn/shared";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { toPlatformOrg } from "@/internal/platform/platformBeta/handlers/platformOrgUtils.js";
import { consumeOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";

const failureMessages = {
	access_denied:
		"Stripe connection was cancelled. Please try again when you are ready.",
	oauth_authorization_failed:
		"Stripe did not authorize the connection. Please try again.",
	missing_parameters:
		"The Stripe callback is missing required parameters. Please restart the connection.",
	invalid_state:
		"This connection request has expired or was already used. Please restart the connection.",
	org_not_found:
		"The organization could not be found. Please restart the connection.",
	account_id_not_found:
		"Stripe did not return an account. Please restart the connection.",
	account_already_connected:
		"This Stripe account is already connected to another organization in this environment.",
	account_mismatch:
		"This Stripe account does not match the account connected through your secret key.",
	account_mismatch_check_failed:
		"The account connected through your secret key could not be verified. Please check your key and try again.",
	oauth_callback_failed:
		"The Stripe connection could not be completed. Please try again.",
};

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
	const frontendUrl = process.env.CLIENT_URL || "http://localhost:3000";
	let redirectUrl = new URL(`${frontendUrl}`);
	redirectUrl.searchParams.set("tab", "stripe");

	const fail = (
		failure: keyof typeof failureMessages,
		details: Record<string, string> = {},
	) => {
		for (const [key, value] of Object.entries(details))
			redirectUrl.searchParams.set(key, value);
		redirectUrl.searchParams.set("success", "false");
		redirectUrl.searchParams.set("error", failure);
		redirectUrl.searchParams.set("message", failureMessages[failure]);
		return c.redirect(redirectUrl.toString());
	};

	if (!state) return fail("missing_parameters");

	try {
		// Consume OAuth state from Redis
		const redisState = await consumeOAuthState({ stateKey: state });

		if (!redisState || redisState.provider === "revenuecat") {
			return fail("invalid_state");
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

		// Use custom redirect URI if provided (platform flow)
		if (isPlatformFlow) {
			redirectUrl = new URL(redirect_uri);
		} else {
			redirectUrl = redirect_uri
				? new URL(redirect_uri)
				: new URL(
						`${frontendUrl}${env === AppEnv.Sandbox ? "/sandbox" : ""}/dev?tab=stripe`,
					);
		}

		// Handle OAuth error from Stripe, now that the caller's return URL is trusted
		if (error) {
			return fail(
				error === "access_denied"
					? "access_denied"
					: "oauth_authorization_failed",
			);
		}
		if (!code) return fail("missing_parameters");

		// Fetch the organization by slug
		const org = await OrgService.getBySlug({ db, slug: organization_slug });

		// Platform state may only connect orgs its master still owns
		const ownershipChanged =
			isPlatformFlow && org?.created_by !== master_org_id;
		if (!org || ownershipChanged) {
			console.error("Organization not found:", organization_slug);
			return fail("org_not_found");
		}

		const stripe = initMasterStripe({ env });
		const response = await stripe.oauth.token({
			grant_type: "authorization_code",
			code,
		});

		const accountId = response.stripe_user_id;

		if (!accountId) {
			console.error("Account ID not found");
			return fail("account_id_not_found");
		}

		// Check if account ID is already connected to another organization (reconnecting is fine)
		const existingOrg = await OrgService.findByStripeAccountId({
			db,
			accountId,
			env,
			excludeOrgId: org.id,
		});

		if (existingOrg) {
			console.error(
				`Account ${accountId} is already connected to org ${existingOrg.id}`,
			);

			// Platform flow only learns about conflicts inside its own platform
			if (isPlatformFlow) {
				if (existingOrg.created_by !== master_org_id) {
					return fail("account_already_connected");
				}
				const publicOrg = toPlatformOrg({
					org: existingOrg,
					masterOrgId: master_org_id,
				});
				return fail("account_already_connected", {
					connected_org_name: publicOrg.name,
					connected_org_slug: publicOrg.slug,
				});
			}

			// Standard flow returns detailed error
			const master = createStripeCli({ org: existingOrg, env });
			// The conflict is still reported if the account can no longer be read
			const account = await master.accounts
				.retrieve(accountId)
				.catch(() => null);
			return fail("account_already_connected", {
				account_id: accountId,
				account_name: account?.company?.name || "",
				connected_org_name: existingOrg.name || "",
				connected_org_slug: existingOrg.slug || "",
			});
		}

		// Both channels must point at the same Stripe account, else OAuth webhooks
		// (this account) would be processed against secret-key billing state.
		const secretKeyConnected = isStripeConnected({
			org,
			env,
			throughSecretKey: true,
		});
		if (secretKeyConnected) {
			try {
				const secretKeyCli = createStripeCli({
					org,
					env,
					throughSecretKey: true,
				});
				const secretKeyAccount = await secretKeyCli.accounts.retrieve();
				if (secretKeyAccount.id !== accountId) {
					return fail("account_mismatch", {
						account_id: accountId,
						secret_key_account_id: secretKeyAccount.id,
					});
				}
			} catch (error) {
				console.error(
					`Failed to verify account match against secret key for org ${org.id} (${org.slug}):`,
					error,
				);
				return fail("account_mismatch_check_failed");
			}
		}

		// Fails if the grant was revoked after the token exchange
		await stripe.balance.retrieve({}, { stripeAccount: accountId });

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
		return fail("oauth_callback_failed");
	}
};
