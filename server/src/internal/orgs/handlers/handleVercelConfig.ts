import {
	AppEnv,
	type Organization,
	UpsertVercelProcessorConfigSchema,
	type VercelMarketplaceMode,
	type VercelProcessorConfig,
} from "@autumn/shared";
import type { ApplicationOut } from "svix";
import { createSvixApp } from "@/external/svix/svixHelpers.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "../OrgService.js";

export const getVercelConfigDisplay = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const mask = (v: string | undefined, prefix: number, suffix: number) => {
		if (!v) return undefined;
		const len = v.length;
		if (len <= prefix + suffix) return v;
		const maskLen = len - prefix - suffix;
		return v.slice(0, prefix) + "*".repeat(maskLen) + v.slice(-suffix);
	};

	const vercelConfig = org.processor_configs?.vercel;
	if (!vercelConfig) {
		return {
			connected: false,
			client_integration_id: undefined,
			client_secret: undefined,
			webhook_url: undefined,
			custom_payment_method: undefined,
			marketplace_mode: undefined,
		};
	}

	// Get env-specific values
	const clientId =
		env === AppEnv.Live
			? vercelConfig.client_integration_id
			: vercelConfig.sandbox_client_id;
	const clientSecret =
		env === AppEnv.Live
			? vercelConfig.client_secret
			: vercelConfig.sandbox_client_secret;
	const webhookUrl =
		env === AppEnv.Live
			? vercelConfig.webhook_url
			: vercelConfig.sandbox_webhook_url;
	const customPaymentMethod =
		env === AppEnv.Live
			? vercelConfig.custom_payment_method?.live
			: vercelConfig.custom_payment_method?.sandbox;

	return {
		connected: !!clientId && !!clientSecret && !!webhookUrl,
		client_integration_id: mask(clientId, 3, 2),
		client_secret: mask(clientSecret, 3, 2),
		webhook_url: mask(webhookUrl, 8, 6),
		custom_payment_method: mask(customPaymentMethod, 5, 3),
		marketplace_mode: vercelConfig.marketplace_mode,
	};
};

export const handleUpsertVercelConfig = createRoute({
	body: UpsertVercelProcessorConfigSchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");

		const body = c.req.valid("json");

		// Merge with existing processor_configs to avoid unsetting fields
		const existingVercelConfig =
			org.processor_configs?.vercel || ({} as VercelProcessorConfig);

		// Merge custom_payment_method object properly
		const customPaymentMethod =
			body.custom_payment_method || existingVercelConfig.custom_payment_method
				? {
						...existingVercelConfig.custom_payment_method,
						...body.custom_payment_method,
					}
				: undefined;

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: {
					...org.processor_configs,
					vercel: {
						...existingVercelConfig,
						// Live fields
						...(body.client_integration_id
							? { client_integration_id: body.client_integration_id }
							: {}),
						...(body.client_secret
							? { client_secret: body.client_secret }
							: {}),
						...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
						// Sandbox fields
						...(body.sandbox_client_id
							? { sandbox_client_id: body.sandbox_client_id }
							: {}),
						...(body.sandbox_client_secret
							? { sandbox_client_secret: body.sandbox_client_secret }
							: {}),
						...(body.sandbox_webhook_url
							? { sandbox_webhook_url: body.sandbox_webhook_url }
							: {}),
						// Custom payment method (for both envs)
						...(customPaymentMethod
							? { custom_payment_method: customPaymentMethod }
							: {}),
						...(body.marketplace_mode
							? {
									marketplace_mode:
										body.marketplace_mode as VercelMarketplaceMode,
								}
							: {}),
					},
				},
			},
		});

		return c.json({
			success: true,
		});
	},
});

export const handleGetVercelSink = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const vercelConfig = org.processor_configs?.vercel;
		const svixCli = createSvixCli();
		let liveApp: ApplicationOut | undefined;
		let sandboxApp: ApplicationOut | undefined;
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
