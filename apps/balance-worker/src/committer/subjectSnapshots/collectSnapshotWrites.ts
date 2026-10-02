import { partitionKeyToMeteringIdentity } from "@autumn/balance-engine";
import type {
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "@autumn/postgres";
import type { SnapshotIntentEntry } from "../../state/types/snapshotIntent.js";
import type { CommitterConfig, Flush, FlushCall } from "../types/committer.js";
import { upsertRowsOf } from "./rows/upsertRowsOf.js";
import { stateExceedsCap } from "./rules/stateExceedsCap.js";

/** One action per customer per flush: write the rows the writer vouched for, else delete the customer's. Undefined when the flush touches no snapshot. */
export const collectSnapshotWrites = ({
	config,
	flush,
}: {
	config: Pick<CommitterConfig, "snapshots">;
	flush: Flush;
}): { writes: SubjectSnapshotWrites; cappedCustomers: number } | undefined => {
	if (!config.snapshots) return undefined;
	const { partitionCount, maxBytes } = config.snapshots;
	const upserts: SubjectSnapshotUpsert[] = [];
	const deletes: SubjectSnapshotWrites["deletes"][number][] = [];
	let cappedCustomers = 0;
	for (const call of flush.calls)
		for (const [customerKey, entry] of call.snapshotIntent ?? []) {
			const rows = rowsOf({ call, entry, partitionCount });
			const overCap = rows.some(({ stateJson }) =>
				stateExceedsCap({ stateJson, maxBytes }),
			);
			if (overCap) cappedCustomers += 1;
			if (entry === "delete" || overCap)
				deletes.push(
					partitionKeyToMeteringIdentity({ partitionKey: customerKey }),
				);
			else upserts.push(...rows);
		}
	if (upserts.length === 0 && deletes.length === 0) return undefined;
	return { writes: { upserts, deletes }, cappedCustomers };
};

const rowsOf = ({
	call,
	entry,
	partitionCount,
}: {
	call: FlushCall;
	entry: SnapshotIntentEntry;
	partitionCount: number;
}): SubjectSnapshotUpsert[] =>
	entry === "delete"
		? []
		: upsertRowsOf({
				...entry,
				partition: call.partition,
				partitionCount,
				logOffset: call.records.at(-1)?.position.offset ?? null,
			});
