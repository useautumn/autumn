import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";

/**
 * Rows the full query answered are written back so the next cold load is a hit. The caller skips this when an
 * evict landed during the read: the rows may predate the write behind it, and the evict's DELETE is already on the lane.
 */
export const backfillSnapshot = ({
	scope,
	identity,
	baseline,
	baselineAt,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	baseline: SubjectState;
	baselineAt: number;
}): void => {
	const { snapshotWrites, position } = scope.ctx;
	if (!snapshotWrites || !position) return;
	snapshotWrites.enqueueBackfill({
		...position,
		customerKey: meteringIdentityToPartitionKey({ identity }),
		states: [baseline],
		baselineAt,
	});
};
