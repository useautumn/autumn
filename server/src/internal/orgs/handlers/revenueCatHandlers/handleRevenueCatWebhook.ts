import { AppEnv, ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
} from "@/external/revenueCat/misc/getRevenuecatAccessToken.js";
import {
	generateRevenuecatWebhookSecret,
	getRevenuecatWebhookSecret,
} from "@/external/revenueCat/misc/getRevenuecatWebhookSecret.js";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli.js";
import {
	getRevenuecatWebhookUrl,
	registerRevenuecatWebhook,
} from "@/external/revenueCat/misc/registerRevenuecatWebhook.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

type WebhookStatus = "registered" | "not_registered" | "unknown";

/** GET /revenuecat/webhook — does the current env's webhook exist on the RC project? + the URL/secret. */
export const handleGetRevenueCatWebhook = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const url = getRevenuecatWebhookUrl({ orgId: org.id, env });
		const secret = getRevenuecatWebhookSecret({ org, env }) ?? null;
		const revenueCatConfig = org.processor_configs?.revenuecat;
		const projectId = revenueCatConfig
			? getRevenuecatProjectId({ revenueCatConfig, env })
			: undefined;
		const accessToken = await getRevenuecatAccessToken({ db, org, env });

		let status: WebhookStatus = "unknown";
		if (url && projectId && accessToken) {
			try {
				const rcCli = initRevenuecatCli({ projectId, accessToken });
				const hooks = await rcCli.listWebhookIntegrations();
				// Match a webhook pointing at THIS org's receiver whose scope covers this env
				// (the specific env, or "both" = null). The host/env-suffix can drift (e.g. ngrok
				// rotates), so key off the org receiver path + the RC `environment` scope, not the
				// exact URL string.
				const orgPath = `/webhooks/revenuecat/${org.id}`;
				const targetEnv = env === AppEnv.Live ? "production" : "sandbox";
				status = hooks.some(
					(hook) =>
						hook.url?.includes(orgPath) &&
						(hook.environment == null || hook.environment === targetEnv),
				)
					? "registered"
					: "not_registered";
			} catch {
				// e.g. the OAuth client lacks the integrations scope → can't verify
				status = "unknown";
			}
		}

		return c.json({ status, url, secret });
	},
});

/** POST /revenuecat/webhook — register (idempotent) the current env's webhook on the RC project. */
export const handleRegisterRevenueCatWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const revenueCatConfig = org.processor_configs?.revenuecat;
		const projectId = revenueCatConfig
			? getRevenuecatProjectId({ revenueCatConfig, env })
			: undefined;
		const accessToken = await getRevenuecatAccessToken({ db, org, env });
		if (!projectId || !accessToken) {
			throw new RecaseError({
				message: "Connect RevenueCat (and select a project) before registering a webhook",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		// Ensure the env's webhook secret exists (generate + persist if missing).
		let secret = getRevenuecatWebhookSecret({ org, env });
		if (!secret) {
			secret = generateRevenuecatWebhookSecret();
			const existing = org.processor_configs?.revenuecat ?? {};
			await OrgService.update({
				db,
				orgId: org.id,
				updates: {
					processor_configs: {
						...org.processor_configs,
						revenuecat:
							env === AppEnv.Live
								? { ...existing, webhook_secret: secret }
								: { ...existing, sandbox_webhook_secret: secret },
					},
				},
			});
		}

		const rcCli = initRevenuecatCli({ projectId, accessToken });
		const result = await registerRevenuecatWebhook({
			rcCli,
			orgId: org.id,
			env,
			secret,
		});

		return c.json({
			status: result === "skipped" ? "unknown" : "registered",
			url: getRevenuecatWebhookUrl({ orgId: org.id, env }),
			secret,
		});
	},
});
