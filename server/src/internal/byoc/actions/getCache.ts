import { orgToCacheDeployment } from "@autumn/byoc";
import type { ApiByocCache } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentToApiCache } from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** The env's cache as alien has it now; a ready one can still be torn down or fail outside Autumn. */
export const getCache = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache | null> => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) return null;
	const cacheDeployment = await refreshCacheDeployment({
		ctx,
		cacheDeployment: existing,
	});
	return cacheDeploymentToApiCache({ cacheDeployment, env: ctx.env });
};
