import type { DeductionUpdate } from "../types/deductionUpdate.js";
import { syncDeductionUpdatesToFullSubjectCache } from "./syncDeductionUpdatesToFullSubjectCache.js";

type SyncParams = Parameters<typeof syncDeductionUpdatesToFullSubjectCache>[0];

const withoutReplaceables = ({
	cusEntUpdates,
}: {
	cusEntUpdates: Record<string, DeductionUpdate>;
}): Record<string, DeductionUpdate> =>
	Object.fromEntries(
		Object.entries(cusEntUpdates).map(
			([
				cusEntId,
				{ newReplaceables: _new, deletedReplaceables: _deleted, ...update },
			]) => [cusEntId, update],
		),
	);

export const syncDeductionBalancesToFullSubjectCache = async ({
	cusEntUpdates,
	...params
}: SyncParams): Promise<void> =>
	syncDeductionUpdatesToFullSubjectCache({
		...params,
		cusEntUpdates: withoutReplaceables({ cusEntUpdates }),
	});
