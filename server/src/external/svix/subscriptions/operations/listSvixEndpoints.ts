import type { AppEnv, Organization } from "@autumn/shared";
import { getSvixAppId, getSvixClient, safeSvix } from "../../svixUtils.js";

export const listSvixEndpoints = safeSvix({
	fn: async ({ org, env }: { org: Organization; env: AppEnv }) => {
		const appId = getSvixAppId({ org, env });
		const svix = getSvixClient();
		if (!appId || !svix) return [];
		return await svix.listEndpoints({ appId });
	},
	action: "listSvixEndpoints",
});
