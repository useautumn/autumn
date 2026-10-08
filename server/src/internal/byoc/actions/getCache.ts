import { orgToCacheDeployment } from "@autumn/byoc";
import type { GetByocCacheResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	cacheDeploymentToApiCache,
	cacheStackName,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** The env's Atom as alien has it now, and the name its stack takes; a ready one can still be torn down or fail outside Autumn. */
export const getCache = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<GetByocCacheResponse> => {
	const stackName = cacheStackName({ org: ctx.org, env: ctx.env });
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	const cacheDeployment =
		existing &&
		(await refreshCacheDeployment({ ctx, cacheDeployment: existing }));
	return {
		cache: cacheDeployment
			? cacheDeploymentToApiCache({ cacheDeployment, env: ctx.env })
			: null,
		stack_name: stackName,
	};
};
