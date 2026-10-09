import type { GetByocCacheResponse } from "@autumn/shared";
import { refreshAtomRecord } from "@/internal/byoc/atomRecords/refreshAtomRecord.js";
import { shadowAtomCacheNames } from "@/internal/byoc/utils/byocCacheUtils.js";
import { isCacheBeingRemoved } from "@/internal/byoc/utils/classifyCacheDeployment.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import { shadowAtomStorage } from "../shadowAtomStorage.js";

/** Our shadow Atom as alien has it now, in the shape an org's Atom page reads; while it comes down it is the one under `removing`. */
export const getShadowAtom = async (): Promise<GetByocCacheResponse> => {
	const stored = await shadowAtomStorage.find();
	const record =
		stored &&
		(await refreshAtomRecord({ ctx: shadowAtomContext(), record: stored }));
	const cache = record ? shadowAtomRecordToApiCache({ record }) : null;
	const isRemoving =
		cache !== null && isCacheBeingRemoved({ cacheDeployment: cache });
	return {
		cache: isRemoving ? null : cache,
		removing: isRemoving && cache ? [cache] : [],
		stack_name: shadowAtomCacheNames().label,
		// Its name is fixed, so Autumn adds nothing to it.
		stack_name_suffix: "",
	};
};
