import type { AppEnv, Organization } from "@autumn/shared";
import { createSvixCli, getSvixAppId, safeSvix } from "../../svixUtils.js";

/** The org's configured endpoints for this env; empty when Svix is
 * unconfigured or the org has no app. */
export const listSvixEndpoints = safeSvix({
	fn: async ({ org, env }: { org: Organization; env: AppEnv }) => {
		const appId = getSvixAppId({ org, env });
		if (!appId) return [];

		const svix = createSvixCli();
		const { data } = await svix.endpoint.list(appId);
		return data;
	},
	action: "listSvixEndpoints",
});
