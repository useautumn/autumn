import type { SubjectRowUpdate } from "@autumn/postgres";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import {
	PartitionProgressConflictError,
	StaleSubjectRowsError,
	UnsupportedRowChangeError,
} from "../committerErrors.js";
import type {
	CommitterContext,
	PartitionPosition,
} from "../types/committer.js";

const updatableTables = new Set<SubjectRowUpdate["table"]>([
	"customerEntitlements",
	"rollovers",
	"usageWindows",
]);

const isUpdatableTable = (table: string): table is SubjectRowUpdate["table"] =>
	updatableTables.has(table as SubjectRowUpdate["table"]);

/** The log's row changes, in log order, as guarded Postgres updates. Only `update` on a balance table lands today. */
const recordsToRowUpdates = ({
	records,
}: {
	records: readonly DurableMutationRecord[];
}): SubjectRowUpdate[] => {
	const updates: SubjectRowUpdate[] = [];
	for (const { mutation } of records) {
		for (const change of mutation.changes) {
			if (change.op !== "update" || !isUpdatableTable(change.table)) {
				throw new UnsupportedRowChangeError({
					table: change.table,
					op: change.op,
				});
			}
			updates.push({
				table: change.table,
				id: change.id,
				before: change.before,
				after: change.after,
			});
		}
	}
	return updates;
};

/** One transaction: every row update, then the bookmark. Either all of it lands or none of it does. */
export const flushBatch = async ({
	ctx,
	topic,
	partition,
	expectedOffset,
	records,
}: {
	ctx: CommitterContext;
	expectedOffset: bigint;
	records: readonly DurableMutationRecord[];
} & PartitionPosition): Promise<{ nextOffset: bigint }> => {
	const last = records.at(-1);
	if (!last) return { nextOffset: expectedOffset };
	const nextOffset = last.position.offset + 1n;
	const updates = recordsToRowUpdates({ records });

	await ctx.db.transaction(async (tx) => {
		const { applied } = await tx.applySubjectRowUpdates({ updates });
		const staleIds = updates
			.filter((_, index) => !applied[index])
			.map((update) => update.id);
		if (staleIds.length > 0) throw new StaleSubjectRowsError({ ids: staleIds });

		const { advanced } = await tx.advancePartitionProgress({
			topic,
			partition,
			expectedOffset,
			nextOffset,
		});
		if (!advanced) {
			throw new PartitionProgressConflictError({
				topic,
				partition,
				expectedOffset,
			});
		}
	});
	return { nextOffset };
};
