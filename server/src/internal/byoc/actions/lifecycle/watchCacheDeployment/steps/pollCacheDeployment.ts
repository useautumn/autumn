import { type ByocCacheDeployment, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshCacheDeployment } from "../../refreshCacheDeployment.js";
import type { CacheDeploymentPoll } from "../types/watchCacheDeploymentTypes.js";

/** alien or the stack's Atom did not answer; the watch waits it out rather than failing. */
const isAtomUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.ByocUnavailable;

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
