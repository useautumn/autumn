import type { AppEnv, Organization } from "@autumn/shared";
import { createSvixCli, getSvixAppId, safeSvix } from "./svixUtils.js";

export const createSvixApp = safeSvix({
	fn: async ({
		name,
		orgId,
		env,
	}: {
		name: string;
		orgId: string;
		env: AppEnv;
	}) => {
		const svix = createSvixCli();
		const app = await svix.application.create({
			name,
			metadata: {
				org_id: orgId,
				env,
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

export const sendSvixEvent = safeSvix({
	fn: async ({
		org,
		env,
		eventType,
		data,
	}: {
		org: Organization;
		env: AppEnv;
		eventType: string;
		data: any;
	}) => {
		const svix = createSvixCli();
		const appId = getSvixAppId({ org, env });
		if (!appId) {
			return null;
		}
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
