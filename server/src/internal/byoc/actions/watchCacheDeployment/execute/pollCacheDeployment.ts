import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshCacheDeployment } from "../../refreshCacheDeployment.js";
import { isAtomUnavailableError } from "../errors/isAtomUnavailableError.js";
import type { CacheDeploymentPoll } from "../types/watchCacheDeploymentTypes.js";

/** Writes alien's latest into the record; an outage is a result to back off from, anything else throws. */
export const pollCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<CacheDeploymentPoll> => {
	try {
		const refreshed = await refreshCacheDeployment({ ctx, cacheDeployment });
		return { ok: true, cacheDeployment: refreshed };
	} catch (error) {
		if (!isAtomUnavailableError(error)) throw error;
		return { ok: false, error };
	}
};
