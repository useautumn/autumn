import type { ApiByocCache, ByocCacheMachine } from "@autumn/shared";
import { resizeAtomRecord } from "@/internal/byoc/atomRecords/resizeAtomRecord.js";
import { cacheNotRunning } from "@/internal/byoc/utils/byocCacheUtils.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import { findShadowAtomRecords } from "../shadowAtomStorage.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";

/** Moves our running shadow Atom to another machine; its folders stay on the volume. */
export const resizeShadowAtom = ({
	machine,
}: {
	machine: ByocCacheMachine;
}): Promise<ApiByocCache> =>
	withShadowAtomLock({
		fn: async () => {
			const { current: existing } = await findShadowAtomRecords();
			if (!existing) throw cacheNotRunning();
			const record = await resizeAtomRecord({
				ctx: shadowAtomContext({
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
				machine,
			});
			return shadowAtomRecordToApiCache({ record });
		},
	});
