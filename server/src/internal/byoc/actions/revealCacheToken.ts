import { orgToCacheDeployment } from "@autumn/byoc";
import type { RevealByocCacheTokenResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { markCacheTokenRevealed } from "../repos/cacheDeployments.js";
import { cacheDeploymentToAtomToken } from "../utils/atomTokenUtils.js";
import { cacheTokenUnavailable } from "../utils/byocCacheUtils.js";

/** Hands the env's Atom token over once; the stamp is claimed in the same write, so two tabs cannot both get it. */
export const revealCacheToken = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<RevealByocCacheTokenResponse> => {
	const cacheDeployment = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!cacheDeployment) throw cacheTokenUnavailable();

	const isFirstReveal = await markCacheTokenRevealed({
		ctx,
		cacheDeployment,
		revealedAt: Date.now(),
	});
	if (!isFirstReveal) throw cacheTokenUnavailable();
	return { token: cacheDeploymentToAtomToken({ cacheDeployment }) };
};
