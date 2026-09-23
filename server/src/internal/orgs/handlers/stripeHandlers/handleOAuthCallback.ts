import { AppEnv } from "@autumn/shared";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { toPlatformOrg } from "@/internal/platform/platformBeta/handlers/platformOrgUtils.js";
import { consumeOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";
import { connectOAuthAccount } from "./connectOAuthAccount.js";

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

export const handleOAuthCallback = async (c: Context<HonoEnv>) => {
	const { code, state, error } = c.req.query();
	const frontendUrl = process.env.CLIENT_URL || "http://localhost:3000";
	let redirectUrl = new URL(frontendUrl);
	redirectUrl.searchParams.set("tab", "stripe");
	const fail = (failure: keyof typeof failureMessages) => {
		redirectUrl.searchParams.set("success", "false");
		redirectUrl.searchParams.set("error", failure);
		redirectUrl.searchParams.set("message", failureMessages[failure]);
		return c.redirect(redirectUrl.toString());
	};
	try {
		if (!state) return fail("missing_parameters");
		const redisState = await consumeOAuthState({ stateKey: state });
		if (!redisState || redisState.provider === "revenuecat")
			return fail("invalid_state");
		const { organization_slug, env, redirect_uri, master_org_id } = redisState;
		redirectUrl = redirect_uri
			? new URL(redirect_uri)
			: new URL(
					`${frontendUrl}${env === AppEnv.Sandbox ? "/sandbox" : ""}/dev?tab=stripe`,
				);
		for (const key of [
			"success",
			"error",
			"message",
			"connected_org_name",
			"connected_org_slug",
			"account_id",
			"account_name",
			"secret_key_account_id",
		])
			redirectUrl.searchParams.delete(key);
		if (error)
			return fail(
				error === "access_denied"
					? "access_denied"
					: "oauth_authorization_failed",
			);
		if (!code) return fail("missing_parameters");
		const { db } = initDrizzle();
		const org = await OrgService.getBySlug({ db, slug: organization_slug });
		if (!org) return fail("org_not_found");
		if (master_org_id && org.created_by !== master_org_id)
			return fail("org_not_found");
		const stripe = initMasterStripe({ env });
		const response = await stripe.oauth.token({
			grant_type: "authorization_code",
			code,
		});
		const accountId = response.stripe_user_id;
		if (!accountId) return fail("account_id_not_found");
		const result = await connectOAuthAccount({
			db,
			orgId: org.id,
			accountId,
			env,
			stripe,
			masterOrgId: master_org_id,
		});
		if (result.error === "account_already_connected" && !master_org_id) {
			const account = await stripe.accounts
				.retrieve(accountId)
				.catch(() => null);
			redirectUrl.searchParams.set("account_id", accountId);
			redirectUrl.searchParams.set(
				"account_name",
				account?.company?.name || "",
			);
			redirectUrl.searchParams.set(
				"connected_org_name",
				result.conflict.name || "",
			);
			redirectUrl.searchParams.set(
				"connected_org_slug",
				result.conflict.slug || "",
			);
		}
		// Platform callers only learn about conflicts inside their own platform.
		if (
			result.error === "account_already_connected" &&
			master_org_id &&
			result.targetOwner === master_org_id &&
			result.conflict.created_by === master_org_id
		) {
			const publicOrg = toPlatformOrg({
				org: result.conflict,
				masterOrgId: master_org_id,
			});
			redirectUrl.searchParams.set("connected_org_name", publicOrg.name);
			redirectUrl.searchParams.set("connected_org_slug", publicOrg.slug);
		}
		if (result.error === "account_mismatch") {
			redirectUrl.searchParams.set("account_id", accountId);
			redirectUrl.searchParams.set(
				"secret_key_account_id",
				result.secretKeyAccountId,
			);
		}
		if (result.error) return fail(result.error);
		redirectUrl.searchParams.set("success", "true");
		return c.redirect(redirectUrl.toString());
	} catch {
		return fail("oauth_callback_failed");
	}
};
