import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	exchangeRcCode,
	findMissingRcScopes,
	RC_OAUTH_SCOPES,
} from "@/external/revenueCat/misc/revenuecatOAuth.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { consumeOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

const buildOAuthConfig = ({
	tokens,
}: {
	tokens: Awaited<ReturnType<typeof exchangeRcCode>>;
}): RevenueCatOAuthConfig => ({
	access_token: encryptData(tokens.accessToken()),
	refresh_token: encryptData(tokens.refreshToken()),
	expires_at: tokens.accessTokenExpiresAt().getTime(),
	...(tokens.hasScopes() ? { scope: tokens.scopes().join(" ") } : {}),
	connected_at: Date.now(),
});

const mergeRevenueCatOAuth = ({
	org,
	env,
	oauthConfig,
}: {
	org: Organization;
	env: AppEnv;
	oauthConfig: RevenueCatOAuthConfig;
}): RevenueCatProcessorConfig => {
	const existing = org.processor_configs?.revenuecat || {};

	return {
		...existing,
		...(env === AppEnv.Live
			? { oauth: oauthConfig }
			: { sandbox_oauth: oauthConfig }),
	};
};

export const handleRevenueCatOAuthCallback = async (c: Context<HonoEnv>) => {
	const query = c.req.query();
	const { code, state, error } = query;

	const { db } = initDrizzle();

	const frontendUrl = process.env.CLIENT_URL || "http://localhost:3000";
	let redirectUrl = new URL(`${frontendUrl}`);
	redirectUrl.searchParams.set("tab", "revenuecat");

	if (error) {
		redirectUrl.searchParams.set("error", error);
		return c.redirect(redirectUrl.toString());
	}

	if (!code || !state) {
		redirectUrl.searchParams.set("error", "missing_parameters");
		return c.redirect(redirectUrl.toString());
	}

	try {
		const redisState = await consumeOAuthState({ stateKey: state });

		if (!redisState) {
			redirectUrl.searchParams.set("error", "invalid_state");
			return c.redirect(redirectUrl.toString());
		}

		const {
			organization_slug,
			env: envStr,
			redirect_uri,
			code_verifier,
			provider,
		} = redisState;

		if (provider !== "revenuecat") {
			redirectUrl.searchParams.set("error", "invalid_provider");
			return c.redirect(redirectUrl.toString());
		}

		if (!code_verifier) {
			redirectUrl.searchParams.set("error", "missing_code_verifier");
			return c.redirect(redirectUrl.toString());
		}

		const env = envStr === "live" ? AppEnv.Live : AppEnv.Sandbox;

		redirectUrl = redirect_uri
			? new URL(redirect_uri)
			: new URL(
					`${frontendUrl}${env === AppEnv.Sandbox ? "/sandbox" : ""}/dev?tab=revenuecat`,
				);

		const org = await OrgService.getBySlug({ db, slug: organization_slug });

		if (!org) {
			console.error("Organization not found:", organization_slug);
			redirectUrl.searchParams.set("error", "org_not_found");
			return c.redirect(redirectUrl.toString());
		}

		const tokens = await exchangeRcCode({ code, codeVerifier: code_verifier });

		const grantedScopes = tokens.hasScopes() ? tokens.scopes() : [];
		const missingScopes = findMissingRcScopes(grantedScopes);

		console.log(`[RCOAuth] Requested scopes: [${RC_OAUTH_SCOPES.join(", ")}]`);
		console.log(`[RCOAuth] Called back: [${grantedScopes.join(", ")}]`);
		console.log(`[RCOAuth] Missing: [${missingScopes.join(", ")}]`);

		if (missingScopes.length > 0) {
			redirectUrl.searchParams.set("error", "insufficient_scope");
			redirectUrl.searchParams.set("missing_scopes", missingScopes.join(","));
			return c.redirect(redirectUrl.toString());
		}

		const oauthConfig = buildOAuthConfig({ tokens });

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: {
					...org.processor_configs,
					revenuecat: mergeRevenueCatOAuth({ org, env, oauthConfig }),
				},
			},
		});

		console.log(`Successfully connected RevenueCat OAuth for org ${org.id}`);

		redirectUrl.searchParams.set("success", "true");
		return c.redirect(redirectUrl.toString());
	} catch (callbackError: unknown) {
		console.error("Error in RevenueCat OAuth callback:", callbackError);
		redirectUrl.searchParams.set(
			"error",
			callbackError instanceof Error ? callbackError.message : "unknown_error",
		);
		return c.redirect(redirectUrl.toString());
	}
};
