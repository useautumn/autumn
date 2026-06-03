import {
	AppEnv,
	InternalError,
	type Organization,
	type RevenueCatProcessorConfig,
	UpsertRevenueCatProcessorConfigSchema,
	Scopes,
} from "@autumn/shared";
import { getRevenuecatAccessToken } from "@server/external/revenueCat/misc/getRevenuecatAccessToken.js";
import {
	generateRevenuecatWebhookSecret,
	getRevenuecatWebhookSecret,
} from "@server/external/revenueCat/misc/getRevenuecatWebhookSecret.js";
import { initRevenuecatCli } from "@server/external/revenueCat/misc/initRevenuecatCli.js";
import { registerRevenuecatWebhook } from "@server/external/revenueCat/misc/registerRevenuecatWebhook.js";
import { createSvixApp } from "@server/external/svix/svixHelpers.js";
import { createSvixCli } from "@server/external/svix/svixUtils.js";
import { createRoute } from "@server/honoMiddlewares/routeHandler.js";
import { decryptData, encryptData } from "@server/utils/encryptUtils.js";
import { mask } from "@server/utils/genUtils.js";
import type { ApplicationOut } from "svix";
import { OrgService } from "../OrgService.js";

const generateWebhookSecret = generateRevenuecatWebhookSecret;

export const getRevenueCatConfigDisplay = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const revenueCatConfig = org.processor_configs?.revenuecat;
	if (!revenueCatConfig) {
		return {
			connected: false,
			connection: "none" as const,
			oauth_connected: false,
			api_key: undefined,
			sandbox_api_key: undefined,
			project_id: undefined,
			sandbox_project_id: undefined,
			webhook_secret: undefined,
			sandbox_webhook_secret: undefined,
		};
	}

	const liveApiKeyDecrypted = revenueCatConfig.api_key
		? decryptData(revenueCatConfig.api_key)
		: undefined;
	const sandboxApiKeyDecrypted = revenueCatConfig.sandbox_api_key
		? decryptData(revenueCatConfig.sandbox_api_key)
		: undefined;

	const webhookSecret =
		env === AppEnv.Live
			? revenueCatConfig.webhook_secret
			: revenueCatConfig.sandbox_webhook_secret;

	const apiKeyForEnv =
		env === AppEnv.Live ? liveApiKeyDecrypted : sandboxApiKeyDecrypted;

	const oauthForEnv =
		env === AppEnv.Live
			? revenueCatConfig.oauth
			: revenueCatConfig.sandbox_oauth;

	const oauthConnected = !!oauthForEnv;
	const connection = oauthConnected
		? ("oauth" as const)
		: apiKeyForEnv
			? ("api_key" as const)
			: ("none" as const);

	return {
		connected: (!!apiKeyForEnv || oauthConnected) && !!webhookSecret,
		connection,
		oauth_connected: oauthConnected,
		api_key: mask(liveApiKeyDecrypted, 3, 2),
		sandbox_api_key: mask(sandboxApiKeyDecrypted, 5, 5),
		project_id: revenueCatConfig.project_id ?? oauthForEnv?.project_id,
		sandbox_project_id:
			revenueCatConfig.sandbox_project_id ??
			revenueCatConfig.sandbox_oauth?.project_id,
		webhook_secret: revenueCatConfig.webhook_secret,
		sandbox_webhook_secret: revenueCatConfig.sandbox_webhook_secret,
	};
};

export const handleGetRevenueCatConfig = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const revenueCatConfig = org.processor_configs?.revenuecat;

		// Generate webhook secrets if they don't exist
		const needsWebhookSecrets =
			!revenueCatConfig?.webhook_secret ||
			!revenueCatConfig?.sandbox_webhook_secret;

		if (!revenueCatConfig || needsWebhookSecrets) {
			const webhookSecret =
				revenueCatConfig?.webhook_secret || generateWebhookSecret();
			const sandboxWebhookSecret =
				revenueCatConfig?.sandbox_webhook_secret || generateWebhookSecret();

			await OrgService.update({
				db,
				orgId: org.id,
				updates: {
					processor_configs: {
						...org.processor_configs,
						revenuecat: {
							...(revenueCatConfig || ({} as RevenueCatProcessorConfig)),
							webhook_secret: webhookSecret,
							sandbox_webhook_secret: sandboxWebhookSecret,
						},
					},
				},
			});

			// Return fresh config after update
			return c.json({
				connected: false,
				connection: "none" as const,
				oauth_connected: false,
				api_key: undefined,
				sandbox_api_key: undefined,
				project_id: undefined,
				sandbox_project_id: undefined,
				webhook_secret: webhookSecret,
				sandbox_webhook_secret: sandboxWebhookSecret,
			});
		}

		const config = getRevenueCatConfigDisplay({ org, env });

		return c.json(config);
	},
});

export const handleUpsertRevenueCatConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpsertRevenueCatProcessorConfigSchema,
	handler: async (c) => {
		const { db, org, logger } = c.get("ctx");

		const body = c.req.valid("json");

		// Merge with existing processor_configs to avoid unsetting fields
		const existingRevenueCatConfig =
			org.processor_configs?.revenuecat || ({} as RevenueCatProcessorConfig);

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: {
					...org.processor_configs,
					revenuecat: {
						...existingRevenueCatConfig,
						// Live fields
						...(body.api_key ? { api_key: encryptData(body.api_key) } : {}),
						...(body.sandbox_api_key
							? { sandbox_api_key: encryptData(body.sandbox_api_key) }
							: {}),
						...(body.project_id ? { project_id: body.project_id } : {}),
						...(body.sandbox_project_id
							? { sandbox_project_id: body.sandbox_project_id }
							: {}),
					},
				},
			},
		});

		// Best-effort: register the inbound RC webhook for any env whose project was just set
		// (covers an org that connected OAuth, then selected its project here). Idempotent.
		const targets: Array<{ env: AppEnv; projectId: string }> = [];
		if (body.project_id) {
			targets.push({ env: AppEnv.Live, projectId: body.project_id });
		}
		if (body.sandbox_project_id) {
			targets.push({
				env: AppEnv.Sandbox,
				projectId: body.sandbox_project_id,
			});
		}
		for (const { env, projectId } of targets) {
			try {
				const accessToken = await getRevenuecatAccessToken({ db, org, env });
				const secret = getRevenuecatWebhookSecret({ org, env });
				if (!accessToken || !secret) continue;
				const rcCli = initRevenuecatCli({ accessToken, projectId });
				await registerRevenuecatWebhook({
					rcCli,
					orgId: org.id,
					env,
					secret,
				});
			} catch (webhookError) {
				logger.warn(
					`[RC] webhook registration failed for org ${org.id} (${env}): ${webhookError}`,
				);
			}
		}

		return c.json({
			success: true,
		});
	},
});

const handleGetVercelSink = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const vercelConfig = org.processor_configs?.vercel;
		const svixCli = createSvixCli();
		let liveApp: ApplicationOut | undefined;
		let sandboxApp: ApplicationOut | undefined;

		if (!vercelConfig) {
			throw new InternalError({
				message: `Vercel config not found for org ${org.id}`,
			});
		}

		if (!vercelConfig?.svix?.live_id || !vercelConfig?.svix?.sandbox_id) {
			liveApp = await createSvixApp({
				name: `${org.slug}_live_vercel_sink`,
				orgId: org.id,
				env: AppEnv.Live,
			});
		}

		if (!vercelConfig?.svix?.sandbox_id) {
			sandboxApp = await createSvixApp({
				name: `${org.slug}_sandbox_vercel_sink`,
				orgId: org.id,
				env: AppEnv.Sandbox,
			});
		}

		const updates = {
			...(liveApp
				? { svix: { ...(vercelConfig?.svix || {}), live_id: liveApp.id } }
				: {}),
			...(sandboxApp
				? { svix: { ...(vercelConfig?.svix || {}), sandbox_id: sandboxApp.id } }
				: {}),
		};

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: {
					...org.processor_configs,
					vercel: { ...(vercelConfig || {}), ...updates },
				},
			},
		});

		let url: string | undefined;

		if (env === AppEnv.Live) {
			url = (
				await svixCli.authentication.appPortalAccess(
					liveApp?.id || vercelConfig?.svix?.live_id || "",
					{
						featureFlags: ["vercel"],
					},
				)
			).url;
		} else {
			url = (
				await svixCli.authentication.appPortalAccess(
					sandboxApp?.id || vercelConfig?.svix?.sandbox_id || "",
					{
						featureFlags: ["vercel"],
					},
				)
			).url;
		}

		return c.json({ url });
	},
});
