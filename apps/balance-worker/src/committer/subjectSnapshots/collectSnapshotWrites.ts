import { partitionKeyToMeteringIdentity } from "@autumn/balance-engine";
import type {
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "@autumn/postgres";
import { writesSubjectSnapshots } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type {
	CommitterConfig,
	CommitterContext,
	Flush,
} from "../types/committer.js";
import { upsertRowsOf } from "./rows/upsertRowsOf.js";

/** One action per customer per flush: write the rows the writer vouched for, else delete the customer's. Undefined when the flush touches no snapshot. */
export const collectSnapshotWrites = ({
	ctx,
	config,
	flush,
}: {
	ctx: Pick<CommitterContext, "subjectSnapshotsConfig">;
	config: Pick<CommitterConfig, "snapshots">;
	flush: Flush;
}): SubjectSnapshotWrites | undefined => {
	const settings = ctx.subjectSnapshotsConfig?.get();
	if (!config.snapshots || !settings || !writesSubjectSnapshots(settings))
		return undefined;
	const { partitionCount } = config.snapshots;
	const upserts: SubjectSnapshotUpsert[] = [];
	const deletes: SubjectSnapshotWrites["deletes"][number][] = [];
	for (const call of flush.calls)
		for (const [customerKey, entry] of call.snapshotIntent ?? []) {
			if (entry === "delete")
				deletes.push(
					partitionKeyToMeteringIdentity({ partitionKey: customerKey }),
				);
			else
				upserts.push(
					...upsertRowsOf({
						...entry,
						partition: call.partition,
						partitionCount,
						logOffset: call.records.at(-1)?.position.offset ?? null,
					}),
				);
		}
	if (upserts.length === 0 && deletes.length === 0) return undefined;
	return { upserts, deletes };
};
