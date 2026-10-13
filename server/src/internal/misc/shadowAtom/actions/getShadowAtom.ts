import type { GetByocCacheResponse } from "@autumn/shared";
import { refreshAtomRecord } from "@/internal/byoc/atomRecords/refreshAtomRecord.js";
import {
	atomStackNameSuffix,
	SHADOW_ATOM_OWNER,
} from "@/internal/byoc/utils/byocCacheUtils.js";
import { isCacheBeingRemoved } from "@/internal/byoc/utils/classifyCacheDeployment.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import {
	nextShadowAtomNames,
	shadowAtomRecordNames,
} from "../shadowAtomNames.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import { findShadowAtomRecords } from "../shadowAtomStorage.js";
import type { ShadowAtomRecord } from "../types/shadowAtomRecord.js";

const refreshShadowAtomRecord = (record: ShadowAtomRecord | null) =>
	record &&
	refreshAtomRecord({
		ctx: shadowAtomContext({ deploymentGroupId: record.deployment_group_id }),
		record,
	});

/** The current shadow Atom's names, or the ones the next one takes; only a named Atom has a suffix to show. */
const shadowAtomStackName = ({
	current,
	previous,
}: {
	current: ShadowAtomRecord | null;
	previous: ShadowAtomRecord[];
}) => {
	const { atomId, label } = current
		? { atomId: current.atom_id, ...shadowAtomRecordNames({ record: current }) }
		: nextShadowAtomNames({ previous });
	return {
		stack_name: label,
		stack_name_suffix: atomId
			? atomStackNameSuffix({ owner: SHADOW_ATOM_OWNER, atomId })
			: "",
	};
};

/** The shadow Atom and earlier ones still coming down, as alien has them now, in the shape `getCache` gives an org's. */
export const getShadowAtom = async (): Promise<GetByocCacheResponse> => {
	const stored = await findShadowAtomRecords();
	const [refreshed, ...previous] = await Promise.all(
		[stored.current, ...stored.previous].map(refreshShadowAtomRecord),
	);
	const isRemoving =
		refreshed !== null && isCacheBeingRemoved({ cacheDeployment: refreshed });
	const current = isRemoving ? null : refreshed;
	const removing = [...previous, isRemoving ? refreshed : null].filter(
		(record) => record !== null,
	);
	return {
		cache: current ? shadowAtomRecordToApiCache({ record: current }) : null,
		removing: removing.map((record) => shadowAtomRecordToApiCache({ record })),
		...shadowAtomStackName({ current, previous: removing }),
	};
};
