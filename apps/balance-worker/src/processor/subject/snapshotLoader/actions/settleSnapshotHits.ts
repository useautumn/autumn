import type { SubjectSnapshotRow } from "@autumn/postgres";
import type { SubjectScope } from "../../types/subject.js";
import { decideSnapshotHit } from "../rules/decideSnapshotHit.js";
import type { SnapshotWaiting } from "../types/snapshotLoader.js";
import {
	emptySnapshotBatchCounts,
	type SnapshotBatchCounts,
} from "./logSnapshotBatch.js";

/** Answers every subject whose row may stand in for its full read; the rest come back as misses, counted by reason. */
export const settleSnapshotHits = ({
	scope,
	batch,
	rowsBySubject,
}: {
	scope: SubjectScope;
	batch: readonly SnapshotWaiting[];
	rowsBySubject: ReadonlyMap<string, SubjectSnapshotRow>;
}): { misses: SnapshotWaiting[]; counts: SnapshotBatchCounts } => {
	const now = scope.ctx.receiptPolicy.now();
	const ttlMs = scope.ctx.subjectSnapshotsConfig?.get().ttlMs ?? 0;
	const counts = emptySnapshotBatchCounts();
	const misses: SnapshotWaiting[] = [];
	for (const entry of batch) {
		const decided = decideSnapshotHit({
			row: rowsBySubject.get(entry.subjectKey),
			identity: entry.identity,
			asOf: entry.asOf,
			now,
			ttlMs,
		});
		if (decided.hit) {
			counts.hits += 1;
			entry.settle.resolve(decided.state);
		} else {
			counts[decided.reason] += 1;
			misses.push(entry);
		}
	}
	return { misses, counts };
};
