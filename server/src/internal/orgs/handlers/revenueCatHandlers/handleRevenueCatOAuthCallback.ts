import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import type { Context } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { generateRevenuecatWebhookSecret } from "@/external/revenueCat/misc/getRevenuecatWebhookSecret.js";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli.js";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import { registerRevenuecatWebhook } from "@/external/revenueCat/misc/registerRevenuecatWebhook.js";
import {
	exchangeRcCode,
	findMissingRcScopes,
	RC_OAUTH_SCOPES,
} from "@/external/revenueCat/misc/revenuecatOAuth.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { consumeOAuthState } from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

const buildOAuthConfig = ({
	tokens,
	projectId,
}: {
	tokens: Awaited<ReturnType<typeof exchangeRcCode>>;
	projectId?: string;
}): RevenueCatOAuthConfig => ({
	access_token: encryptData(tokens.accessToken()),
	refresh_token: encryptData(tokens.refreshToken()),
	expires_at: tokens.accessTokenExpiresAt().getTime(),
	...(tokens.hasScopes() ? { scope: tokens.scopes().join(" ") } : {}),
	...(projectId ? { project_id: projectId } : {}),
	connected_at: Date.now(),
});

const mergeRevenueCatOAuth = ({
	org,
	env,
	oauthConfig,
	stripLegacy = false,
}: {
	org: Organization;
	env: AppEnv;
	oauthConfig: RevenueCatOAuthConfig;
	// Migration: drop the env's legacy api_key + project_id once OAuth is connected.
	stripLegacy?: boolean;
}): RevenueCatProcessorConfig => {
	const existing = org.processor_configs?.revenuecat || {};

	let base = existing;
	if (stripLegacy) {
		if (env === AppEnv.Live) {
			const { api_key, project_id, ...rest } = existing;
			base = rest;
		} else {
			const { sandbox_api_key, sandbox_project_id, ...rest } = existing;
			base = rest;
		}
	}

	return {
		...base,
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
	let isPlatformFlow = false;

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
			env,
			redirect_uri,
			code_verifier,
			provider,
			master_org_id,
			revenuecat_project_name,
			migration,
		} = redisState;

		if (provider !== "revenuecat") {
			redirectUrl.searchParams.set("error", "invalid_provider");
			return c.redirect(redirectUrl.toString());
		}

		if (!code_verifier) {
			redirectUrl.searchParams.set("error", "missing_code_verifier");
			return c.redirect(redirectUrl.toString());
		}

		isPlatformFlow = master_org_id !== null;

		if (isPlatformFlow) {
			redirectUrl = new URL(redirect_uri);
		} else {
			redirectUrl = redirect_uri
				? new URL(redirect_uri)
				: new URL(
						`${frontendUrl}${env === AppEnv.Sandbox ? "/sandbox" : ""}/dev?tab=revenuecat`,
					);
		}

		const org = await OrgService.getBySlug({ db, slug: organization_slug });

		if (!org) {
			console.error("Organization not found:", organization_slug);
			if (isPlatformFlow) {
				redirectUrl.searchParams.set("success", "false");
				redirectUrl.searchParams.set("provider", "revenuecat");
				redirectUrl.searchParams.set("message", "org_not_found");
			} else {
				redirectUrl.searchParams.set("error", "org_not_found");
			}
			return c.redirect(redirectUrl.toString());
		}

		if (isPlatformFlow && org.created_by !== master_org_id) {
			console.error("Platform org mismatch:", org.id, master_org_id);
			redirectUrl.searchParams.set("success", "false");
			redirectUrl.searchParams.set("provider", "revenuecat");
			redirectUrl.searchParams.set("message", "org_permission_denied");
			return c.redirect(redirectUrl.toString());
		}

		const tokens = await exchangeRcCode({ code, codeVerifier: code_verifier });

		const grantedScopes = tokens.hasScopes() ? tokens.scopes() : [];
		const missingScopes = findMissingRcScopes(grantedScopes);

		console.log(`[RCOAuth] Requested scopes: [${RC_OAUTH_SCOPES.join(", ")}]`);
		console.log(`[RCOAuth] Called back: [${grantedScopes.join(", ")}]`);
		console.log(`[RCOAuth] Missing: [${missingScopes.join(", ")}]`);

		if (missingScopes.length > 0) {
			if (isPlatformFlow) {
				redirectUrl.searchParams.set("success", "false");
				redirectUrl.searchParams.set("provider", "revenuecat");
				redirectUrl.searchParams.set("message", "insufficient_scope");
			} else {
				redirectUrl.searchParams.set("error", "insufficient_scope");
				redirectUrl.searchParams.set("missing_scopes", missingScopes.join(","));
			}
			return c.redirect(redirectUrl.toString());
		}

		const isMigration = !isPlatformFlow && migration === true;

		let projectId: string | undefined;
		if (isPlatformFlow) {
			if (!revenuecat_project_name) {
				redirectUrl.searchParams.set("success", "false");
				redirectUrl.searchParams.set("provider", "revenuecat");
				redirectUrl.searchParams.set("message", "missing_project_name");
				return c.redirect(redirectUrl.toString());
			}

			const rcCli = initRevenuecatCli({ accessToken: tokens.accessToken() });
			const project = await rcCli.createProject({
				name: revenuecat_project_name,
			});
			projectId = project.id;
		} else if (isMigration) {
			// Migrate api-key → OAuth: the OAuth account must contain the org's existing
			// project, and that project's products must cover the existing mappings.
			const revenueCatConfig = org.processor_configs?.revenuecat;
			const existingProjectId =
				env === AppEnv.Live
					? revenueCatConfig?.project_id
					: revenueCatConfig?.sandbox_project_id;

			if (!existingProjectId) {
				redirectUrl.searchParams.set("error", "no_project_to_migrate");
				return c.redirect(redirectUrl.toString());
			}

			const accountCli = initRevenuecatCli({
				accessToken: tokens.accessToken(),
			});
			const { projects } = await accountCli.listProjects();
			if (!projects.some((p) => p.id === existingProjectId)) {
				redirectUrl.searchParams.set("error", "project_not_in_account");
				return c.redirect(redirectUrl.toString());
			}

			const projectCli = initRevenuecatCli({
				accessToken: tokens.accessToken(),
				projectId: existingProjectId,
			});
			const projectStoreIds = await projectCli.listProductStoreIdentifiers();
			const mappings = await RCMappingService.getAll({
				db,
				orgId: org.id,
				env,
			});
			const mappedIds = [
				...new Set(mappings.flatMap((m) => m.revenuecat_product_ids)),
			];
			const allPresent = mappedIds.every((id) => projectStoreIds.has(id));
			if (!allPresent) {
				redirectUrl.searchParams.set("error", "products_mismatch");
				return c.redirect(redirectUrl.toString());
			}

			projectId = existingProjectId;
		}

		const oauthConfig = buildOAuthConfig({ tokens, projectId });

		// Ensure the env's webhook secret exists (the dashboard generates it lazily, which a
		// platform-managed org never triggers) so we can register the webhook below.
		const existingRc = org.processor_configs?.revenuecat;
		const webhookSecret =
			(env === AppEnv.Live
				? existingRc?.webhook_secret
				: existingRc?.sandbox_webhook_secret) ??
			generateRevenuecatWebhookSecret();

		const mergedRc = mergeRevenueCatOAuth({
			org,
			env,
			oauthConfig,
			stripLegacy: isMigration,
		});

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: {
					...org.processor_configs,
					revenuecat:
						env === AppEnv.Live
							? { ...mergedRc, webhook_secret: webhookSecret }
							: { ...mergedRc, sandbox_webhook_secret: webhookSecret },
				},
			},
		});

		await clearOrgCache({ db, orgId: org.id });

		// Best-effort: register the inbound webhook with RevenueCat (idempotent). Needs a project.
		if (projectId) {
			try {
				const webhookCli = initRevenuecatCli({
					accessToken: tokens.accessToken(),
					projectId,
				});
				await registerRevenuecatWebhook({
					rcCli: webhookCli,
					orgId: org.id,
					env,
					secret: webhookSecret,
				});
			} catch (webhookError) {
				console.error(
					`[RC] webhook registration failed for org ${org.id} (${env}): ${webhookError}`,
				);
			}
		}

		console.log(`Successfully connected RevenueCat OAuth for org ${org.id}`);

		if (isPlatformFlow) {
			redirectUrl.searchParams.set("success", "true");
			redirectUrl.searchParams.set("provider", "revenuecat");
			redirectUrl.searchParams.set("organization_slug", organization_slug);
			redirectUrl.searchParams.set(
				"env",
				env === AppEnv.Live ? "live" : "test",
			);
			if (projectId) {
				redirectUrl.searchParams.set("revenuecat_project_id", projectId);
			}
		} else {
			redirectUrl.searchParams.set("success", "true");
		}
		return c.redirect(redirectUrl.toString());
	} catch (callbackError: unknown) {
		console.error("Error in RevenueCat OAuth callback:", callbackError);
		if (isPlatformFlow) {
			redirectUrl.searchParams.set("success", "false");
			redirectUrl.searchParams.set("provider", "revenuecat");
			redirectUrl.searchParams.set(
				"message",
				callbackError instanceof Error
					? callbackError.message
					: "unknown_error",
			);
		} else {
			redirectUrl.searchParams.set(
				"error",
				callbackError instanceof Error
					? callbackError.message
					: "unknown_error",
			);
		}
		return c.redirect(redirectUrl.toString());
	}
};
