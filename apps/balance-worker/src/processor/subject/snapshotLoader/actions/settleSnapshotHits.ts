import type { SubjectSnapshotRow } from "@autumn/postgres";
import { snapshotStateOf } from "../rules/snapshotStateOf.js";
import type { SnapshotWaiting } from "../types/snapshotLoader.js";
import {
	emptySnapshotBatchCounts,
	type SnapshotBatchCounts,
} from "./logSnapshotBatch.js";

/** Answers every subject whose row parses; the rest come back as misses, absent or unreadable. */
export const settleSnapshotHits = ({
	batch,
	rowsBySubject,
}: {
	batch: readonly SnapshotWaiting[];
	rowsBySubject: ReadonlyMap<string, SubjectSnapshotRow>;
}): { misses: SnapshotWaiting[]; counts: SnapshotBatchCounts } => {
	const counts = emptySnapshotBatchCounts();
	const misses: SnapshotWaiting[] = [];
	for (const entry of batch) {
		const row = rowsBySubject.get(entry.subjectKey);
		const state = row ? snapshotStateOf({ snapshot: row.state }) : null;
		if (state) {
			counts.hits += 1;
			entry.settle.resolve(state);
			continue;
		}
		counts[row ? "parse" : "absent"] += 1;
		misses.push(entry);
	}
	return { misses, counts };
};
