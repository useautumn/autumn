import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import type { CommitterConfig, Flush } from "../types/committer.js";

export const writesSnapshots = ({
	config,
}: {
	config: Pick<CommitterConfig, "snapshots">;
}): boolean => config.snapshots?.read().mode === "write";

/** Rows a call's snapshot writes add to its flush; nothing unless snapshots are written. */
export const snapshotRowsOf = ({
	config,
	records,
	snapshotDrops,
}: {
	config: Pick<CommitterConfig, "snapshots">;
	records: readonly DurableMutationRecord[];
	snapshotDrops?: readonly SubjectSnapshotCustomer[];
}): number => {
	if (!writesSnapshots({ config })) return 0;
	let rows = snapshotDrops?.length ?? 0;
	for (const record of records) rows += record.snapshots?.length ?? 0;
	return rows;
};

export const withoutSnapshots = ({
	record,
}: {
	record: DurableMutationRecord;
}): DurableMutationRecord => {
	if (!record.snapshots) return record;
	const { snapshots: _dropped, ...rest } = record;
	return rest;
};

export const carriesSnapshots = ({ flush }: { flush: Flush }): boolean =>
	flush.calls.some((call) =>
		call.records.some((record) => record.snapshots !== undefined),
	);
