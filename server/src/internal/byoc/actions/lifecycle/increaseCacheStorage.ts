import { isByocCacheReady } from "@autumn/byoc";
import type {
	ApiByocCache,
	ByocCacheDeployment,
	IncreaseByocCacheStorageParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshAtomRecord } from "../../atomRecords/refreshAtomRecord.js";
import type { AtomContext } from "../../atomRecords/types/atomContext.js";
import {
	cacheDeploymentToApiCache,
	cacheDeploymentToMachine,
	cacheMachineUnknown,
	cacheNotRunning,
	cacheStorageCannotShrink,
} from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { withAtomLock } from "./withAtomLock.js";

/** Grows a running Atom's volumes online on the machine it runs on now; the same size changes nothing. */
const growCacheVolume = async ({
	atomCtx,
	record,
	volumeSizeGib,
}: {
	atomCtx: AtomContext<ByocCacheDeployment>;
	record: ByocCacheDeployment;
	volumeSizeGib: number;
}): Promise<ByocCacheDeployment> => {
	const current = await refreshAtomRecord({ ctx: atomCtx, record });
	if (!current || !isByocCacheReady(current)) throw cacheNotRunning();
	if (volumeSizeGib < current.volume_size_gib)
		throw cacheStorageCannotShrink({
			currentGib: current.volume_size_gib,
			requestedGib: volumeSizeGib,
		});
	if (volumeSizeGib === current.volume_size_gib) return current;

	const machine = cacheDeploymentToMachine({ cacheDeployment: current });
	if (!machine) throw cacheMachineUnknown();
	await atomCtx.deployer.growVolume({
		deploymentGroupId: current.deployment_group_id,
		machine,
		volumeSizeGib,
	});
	const grown = { ...current, volume_size_gib: volumeSizeGib };
	await atomCtx.storage.update({ from: current, to: grown });
	return grown;
};

/** Gives both of a running Atom's replicas a bigger volume; storage only grows. */
export const increaseCacheStorage = ({
	ctx,
	params: { atom_id, volume_size_gib },
}: {
	ctx: AutumnContext;
	params: IncreaseByocCacheStorageParams;
}): Promise<ApiByocCache> =>
	withAtomLock({
		ctx,
		atomId: atom_id,
		fn: async (existing) => {
			if (!existing) throw cacheNotRunning();
			const grown = await growCacheVolume({
				atomCtx: cacheDeploymentAtomContext({
					ctx,
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
				volumeSizeGib: volume_size_gib,
			});
			return cacheDeploymentToApiCache({
				cacheDeployment: grown,
				org: ctx.org,
			});
		},
	});
