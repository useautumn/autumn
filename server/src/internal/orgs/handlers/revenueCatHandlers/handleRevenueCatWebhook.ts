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
				status = "unknown";
			}
		}

		return c.json({ status, url, secret });
	},
});

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
				message:
					"Connect RevenueCat (and select a project) before registering a webhook",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

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
		await registerRevenuecatWebhook({
			rcCli,
			orgId: org.id,
			env,
			secret,
		});

		return c.json({
			status: "registered",
			url: getRevenuecatWebhookUrl({ orgId: org.id, env }),
			secret,
		});
	},
});
