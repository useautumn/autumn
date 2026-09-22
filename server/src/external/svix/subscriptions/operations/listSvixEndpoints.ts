import type { AppEnv, Organization } from "@autumn/shared";
import { getSvixAppId, getSvixClient, safeSvix } from "../../svixUtils.js";

/** The org's configured endpoints for this env; empty when Svix is
 * unconfigured or the org has no app. */
export const listSvixEndpoints = safeSvix({
	fn: async ({ org, env }: { org: Organization; env: AppEnv }) => {
		const appId = getSvixAppId({ org, env });
		const svix = getSvixClient();
		if (!appId || !svix) return [];
		return await svix.listEndpoints({ appId });
	},
	action: "listSvixEndpoints",
});
