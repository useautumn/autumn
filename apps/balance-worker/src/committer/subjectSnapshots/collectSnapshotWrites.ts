import { partitionKeyToMeteringIdentity } from "@autumn/balance-engine";
import type {
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "@autumn/postgres";
import type { SnapshotIntentEntry } from "../../state/types/snapshotIntent.js";
import type {
	CommitterConfig,
	CommitterContext,
	Flush,
	FlushCall,
} from "../types/committer.js";
import { upsertRowsOf } from "./rows/upsertRowsOf.js";
import { stateExceedsCap } from "./rules/stateExceedsCap.js";

/** One action per customer per flush: write the rows the writer vouched for, else delete the customer's. Undefined when the flush touches no snapshot. */
export const collectSnapshotWrites = ({
	ctx,
	config,
	flush,
}: {
	ctx: Pick<CommitterContext, "subjectSnapshots">;
	config: Pick<CommitterConfig, "snapshots">;
	flush: Flush;
}): { writes: SubjectSnapshotWrites; cappedCustomers: number } | undefined => {
	const settings = ctx.subjectSnapshots?.get();
	if (!config.snapshots || settings?.mode !== "write") return undefined;
	const { partitionCount } = config.snapshots;
	const { maxBytes, maxFlushBytes } = settings;
	const upserts: SubjectSnapshotUpsert[] = [];
	const deletes: SubjectSnapshotWrites["deletes"][number][] = [];
	let cappedCustomers = 0;
	let flushBytes = 0;
	for (const call of flush.calls)
		for (const [customerKey, entry] of call.snapshotIntent ?? []) {
			if (entry === "delete") {
				deletes.push(
					partitionKeyToMeteringIdentity({ partitionKey: customerKey }),
				);
				continue;
			}
			// Past the flush budget nothing more is serialised: the rest of the flush's customers are deleted.
			const rows =
				flushBytes >= maxFlushBytes
					? []
					: rowsOf({ call, entry, partitionCount });
			const rowBytes = rows.reduce(
				(total, { stateJson }) => total + Buffer.byteLength(stateJson),
				0,
			);
			const overCap =
				rows.length === 0 ||
				flushBytes + rowBytes > maxFlushBytes ||
				rows.some(({ stateJson }) => stateExceedsCap({ stateJson, maxBytes }));
			if (overCap) {
				cappedCustomers += 1;
				deletes.push(
					partitionKeyToMeteringIdentity({ partitionKey: customerKey }),
				);
				continue;
			}
			upserts.push(...rows);
			flushBytes += rowBytes;
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
