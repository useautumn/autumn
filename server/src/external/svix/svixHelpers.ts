import type { AppEnv, Organization } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSvixAppId, getSvixClient, safeSvix } from "./svixUtils.js";

export const createSvixApp = safeSvix({
	fn: async ({
		name,
		orgId,
		env,
		meta = {},
	}: {
		name: string;
		orgId: string;
		env: AppEnv;
		meta?: Record<string, unknown>;
	}) => {
		const svix = getSvixClient();
		if (!svix) return;
		return await svix.createApp({ name, orgId, env, metadata: meta });
	},
	action: "createSvixApp",
});

export const deleteSvixApp = safeSvix({
	fn: async ({ appId }: { appId: string }) => {
		await getSvixClient()?.deleteApp({ appId });
	},
	action: "deleteSvixApp",
});

export const sendSvixEvent = async ({
	ctx,
	eventType,
	data,
	payloadFields,
	idempotencyKey,
	tags,
}: {
	ctx: AutumnContext;
	eventType: string;
	data: unknown;
	payloadFields?: { id?: string; occurred_at?: number };
	idempotencyKey?: string;
	tags?: string[];
}) => {
	if (!process.env.SVIX_API_KEY) return;

	const { org, env } = ctx;

	try {
		ctx.logger.info(`[svix] Firing webhook: ${eventType}`);

		const svix = getSvixClient();
		const appId = getSvixAppId({ org, env });
		if (!svix) return;
		if (!appId) {
			ctx.logger.warn(
				`[svix] No app id for org ${org.id} (${env}); skipping ${eventType}`,
			);
			return null;
		}

		return await svix.sendMessage({
			appId,
			message: { eventType, data, payloadFields, idempotencyKey, tags },
		});
	} catch (error) {
		// Log the tags (the usual culprit) so tag-validation rejections aren't
		// invisible. Don't log Svix's raw error body — it can echo request data.
		const status = error as { code?: number; statusCode?: number };
		ctx.logger.error(
			`[svix] Failed to send ${eventType}: ${error} | status=${status.code ?? status.statusCode} | tags=${JSON.stringify(tags ?? [])}`,
		);
		Sentry.captureException(error, {
			tags: getSentryTags({ ctx }),
		});
	}
};

export const sendCustomSvixEvent = safeSvix({
	fn: async ({
		// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be useful in the future
		org,
		// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be useful in the future
		env,
		eventType,
		data,
		appId,
		idempotencyKey,
	}: {
		org: Organization;
		env: AppEnv;
		eventType: string;
		data: unknown;
		appId: string;
		idempotencyKey?: string;
	}) => {
		return await getSvixClient()?.sendMessage({
			appId,
			message: { eventType, data, idempotencyKey },
		});
	},
	action: "sendSvixEvent",
});

export const getSvixDashboardUrl = safeSvix({
	fn: async ({ org, env }: { org: Organization; env: AppEnv }) => {
		const appId = getSvixAppId({ org, env });
		if (!appId) {
			return null;
		}
		return (await getSvixClient()?.appPortalUrl({ appId })) ?? null;
	},
	action: "getSvixDashboardUrl",
});
