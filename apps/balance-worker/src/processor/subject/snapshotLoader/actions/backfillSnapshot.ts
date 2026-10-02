import {
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../../types/subject.js";
import type { SnapshotWaiting } from "../types/snapshotLoader.js";

/**
 * A miss answered by the full query is written back so the next cold load is a hit. Skipped when an evict landed
 * during the read: the rows may predate the write behind it, and the evict's DELETE is already on the lane.
 */
export const backfillSnapshot = ({
	scope,
	waiting,
	baseline,
}: {
	scope: SubjectScope;
	waiting: SnapshotWaiting;
	baseline: SubjectState;
}): void => {
	const { snapshotWrites, position } = scope.ctx;
	if (!snapshotWrites || !position || waiting.overtaken()) return;
	snapshotWrites.enqueueBackfill({
		...position,
		customerKey: meteringIdentityToPartitionKey({ identity: waiting.identity }),
		states: [baseline],
		baselineAt: waiting.asOf,
	});
};
