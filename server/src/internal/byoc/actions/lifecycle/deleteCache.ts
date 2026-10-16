import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tearDownAtomRecord } from "../../atomRecords/tearDownAtomRecord.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";
import { withAtomLock } from "./withAtomLock.js";

/** Tears down an Atom, or retries one whose removal stopped. The record stays as removing until its stack is gone too. Deleting nothing is a no-op. */
export const deleteCache = ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}) =>
	withAtomLock({
		ctx,
		atomId,
		fn: async (existing) => {
			if (!existing) return;
			const remaining = await tearDownAtomRecord({
				ctx: cacheDeploymentAtomContext({
					ctx,
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
			});
			if (remaining)
				await startCacheDeploymentWatch({
					ctx,
					deploymentGroupId: remaining.deployment_group_id,
				});
		},
	});
