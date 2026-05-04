import type { AppEnv, Organization } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createSvixCli, getSvixAppId, safeSvix } from "./svixUtils.js";

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
		const svix = createSvixCli();
		const app = await svix.application.create({
			name,
			metadata: {
				org_id: orgId,
				env,
				...meta,
			},
		});
		return app;
	},
	action: "createSvixApp",
});

export const deleteSvixApp = safeSvix({
	fn: async ({ appId }: { appId: string }) => {
		const svix = createSvixCli();
		await svix.application.delete(appId);
	},
	action: "deleteSvixApp",
});

export const sendSvixEvent = async ({
	ctx,
	eventType,
	data,
	payloadFields,
}: {
	ctx: AutumnContext;
	eventType: string;
	data: unknown;
	payloadFields?: { id?: string; occurred_at?: number };
}) => {
	if (!process.env.SVIX_API_KEY) return;

	const { org, env } = ctx;

	try {
		ctx.logger.info(`[svix] Firing webhook: ${eventType}`);

		const svix = createSvixCli();
		const appId = getSvixAppId({ org, env });
		if (!appId) return null;

		return await svix.message.create(appId, {
			eventType,
			payload: {
				type: eventType,
				...payloadFields,
				data,
			},
		});
	} catch (error) {
		ctx.logger.error(`[svix] Failed to send ${eventType}: ${error}`);
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
	}: {
		org: Organization;
		env: AppEnv;
		eventType: string;
		data: unknown;
		appId: string;
	}) => {
		const svix = createSvixCli();
		return await svix.message.create(appId, {
			eventType,
			payload: {
				type: eventType,
				data,
			},
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
		const svix = createSvixCli();
		const dashboard = await svix.authentication.appPortalAccess(appId, {});
		return dashboard.url;
	},
	action: "getSvixDashboardUrl",
});
