import type { RowChange } from "@autumn/balance-engine";
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

const definedNumbers = (record: Record<string, number | undefined>) =>
	Object.fromEntries(
		Object.entries(record).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, value]],
		),
	);

type BalanceRowChange = Extract<
	RowChange,
	{ table: SubjectRowUpdate["table"]; op: "update" | "increment" }
>;

/** An increment adds its counters; an update replaces its columns under the before guard. */
const balanceRowChangeToUpdate = ({
	change,
}: {
	change: BalanceRowChange;
}): SubjectRowUpdate => {
	if (change.op === "update") {
		return {
			kind: "set",
			table: change.table,
			id: change.id,
			set: change.after,
			guard: change.before,
		};
	}
	const entries: Record<
		string,
		Record<string, Record<string, number | undefined>> | undefined
	> = change.addEntries ?? {};
	return {
		kind: "add",
		table: change.table,
		id: change.id,
		add: definedNumbers(change.add),
		addEntries: Object.fromEntries(
			Object.entries(entries).flatMap(([column, byKey]) =>
				byKey === undefined
					? []
					: [
							[
								column,
								Object.fromEntries(
									Object.entries(byKey).map(([key, fields]) => [
										key,
										definedNumbers(fields),
									]),
								),
							],
						],
			),
		),
		guard: change.guard ?? {},
	};
};

/** The change as Postgres lands it; only moves on a balance table land today. */
const rowChangeToUpdate = ({
	change,
}: {
	change: RowChange;
}): SubjectRowUpdate => {
	switch (change.table) {
		case "customer":
		case "entity":
		case "customerProducts":
		case "customerPrices":
			throw new UnsupportedRowChangeError({
				table: change.table,
				op: change.op,
			});
	}
	if (change.op === "insert" || change.op === "delete") {
		throw new UnsupportedRowChangeError({ table: change.table, op: change.op });
	}
	return balanceRowChangeToUpdate({ change });
};

/** The log's row changes, in log order, as Postgres updates. */
const recordsToRowUpdates = ({
	records,
}: {
	records: readonly DurableMutationRecord[];
}): SubjectRowUpdate[] =>
	records.flatMap(({ mutation }) =>
		mutation.changes.map((change) => rowChangeToUpdate({ change })),
	);

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
