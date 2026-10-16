import type { ApiByocCache, ResizeByocCacheParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resizeAtomRecord } from "../../atomRecords/resizeAtomRecord.js";
import {
	cacheDeploymentToApiCache,
	cacheNotRunning,
	resourcesToMachine,
} from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { withAtomLock } from "./withAtomLock.js";

/** Moves a running Atom to another machine; its balances stay on the volume. */
export const resizeCache = ({
	ctx,
	params: { atom_id, cpu, memory },
}: {
	ctx: AutumnContext;
	params: ResizeByocCacheParams;
}): Promise<ApiByocCache> =>
	withAtomLock({
		ctx,
		atomId: atom_id,
		fn: async (existing) => {
			if (!existing) throw cacheNotRunning();
			const resized = await resizeAtomRecord({
				ctx: cacheDeploymentAtomContext({
					ctx,
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
				machine: resourcesToMachine({ cpu, memory }),
			});
			return cacheDeploymentToApiCache({
				cacheDeployment: resized,
				org: ctx.org,
			});
		},
	});
