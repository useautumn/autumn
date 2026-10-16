import type { ApiByocCache } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { retryAtomRecord } from "../../atomRecords/retryAtomRecord.js";
import {
	cacheDeploymentToApiCache,
	cacheNotFailed,
} from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";
import { withAtomLock } from "./withAtomLock.js";

/** Resumes a failed deploy from the step that failed, and watches it again. */
export const retryCache = ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<ApiByocCache> =>
	withAtomLock({
		ctx,
		atomId,
		fn: async (existing) => {
			if (!existing) throw cacheNotFailed();
			const resumed = await retryAtomRecord({
				ctx: cacheDeploymentAtomContext({
					ctx,
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
			});
			await startCacheDeploymentWatch({
				ctx,
				deploymentGroupId: resumed.deployment_group_id,
			});
			return cacheDeploymentToApiCache({
				cacheDeployment: resumed,
				org: ctx.org,
			});
		},
	});
