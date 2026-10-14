import type { ApiByocCache } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { retryAtomRecord } from "@/internal/byoc/atomRecords/retryAtomRecord.js";
import { cacheNotFailed } from "@/internal/byoc/utils/byocCacheUtils.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import { findShadowAtomRecords } from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";

export const retryShadowAtom = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache> =>
	withShadowAtomLock({
		fn: async () => {
			const { current: existing } = await findShadowAtomRecords();
			if (!existing) throw cacheNotFailed();
			const record = await retryAtomRecord({
				ctx: shadowAtomContext({
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
			});
			await startShadowAtomWatch({
				ctx,
				deploymentGroupId: record.deployment_group_id,
			});
			return shadowAtomRecordToApiCache({ record });
		},
	});
