import type { SubjectSnapshotRow } from "@autumn/postgres";
import { snapshotStateOf } from "../rules/snapshotStateOf.js";
import type {
	SnapshotFullRead,
	SnapshotWaiting,
} from "../types/snapshotLoader.js";
import {
	emptySnapshotBatchCounts,
	type SnapshotBatchCounts,
} from "./logSnapshotBatch.js";

/**
 * Answers every subject whose row parses when serving; the rest go to the full query, absent or unreadable. Verifying
 * sends a parsed row along to the full query instead, to be compared with what it answers.
 */
export const settleSnapshotHits = ({
	batch,
	rowsBySubject,
	serving,
}: {
	batch: readonly SnapshotWaiting[];
	rowsBySubject: ReadonlyMap<string, SubjectSnapshotRow>;
	serving: boolean;
}): { fullReads: SnapshotFullRead[]; counts: SnapshotBatchCounts } => {
	const counts = emptySnapshotBatchCounts();
	const fullReads: SnapshotFullRead[] = [];
	for (const waiting of batch) {
		const row = rowsBySubject.get(waiting.subjectKey);
		const snapshot = row ? snapshotStateOf({ snapshot: row.state }) : null;
		if (snapshot) counts.hits += 1;
		else counts[row ? "parse" : "absent"] += 1;
		if (snapshot && serving) waiting.settle.resolve(snapshot);
		else fullReads.push({ waiting, snapshot });
	}
	return { fullReads, counts };
};
