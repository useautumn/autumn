import { orgToCacheDeployment } from "@autumn/byoc";
import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentToApiCache } from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** The env's cache, refreshed from alien until it is ready. */
export const getCache = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache | null> => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) return null;
	const isReady = existing.status === ByocCacheStatus.Ready;
	const cacheDeployment = isReady
		? existing
		: await refreshCacheDeployment({ ctx, cacheDeployment: existing });
	return cacheDeploymentToApiCache({ cacheDeployment, env: ctx.env });
};
