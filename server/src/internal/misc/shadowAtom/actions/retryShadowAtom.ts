import type { ApiByocCache } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { retryAtomRecord } from "@/internal/byoc/atomRecords/retryAtomRecord.js";
import { cacheNotFailed } from "@/internal/byoc/utils/byocCacheUtils.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import { shadowAtomStorage } from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";

/** Resumes our shadow Atom's failed deploy from the step that failed, and watches it again. */
export const retryShadowAtom = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache> =>
	withShadowAtomLock({
		fn: async () => {
			const existing = await shadowAtomStorage.find();
			if (!existing) throw cacheNotFailed();
			const record = await retryAtomRecord({
				ctx: shadowAtomContext(),
				record: existing,
			});
			await startShadowAtomWatch({
				ctx,
				deploymentGroupId: record.deployment_group_id,
			});
			return shadowAtomRecordToApiCache({ record });
		},
	});
