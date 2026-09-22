import type { RowChange } from "@autumn/balance-engine";
import {
	type FlushBookmark,
	type SubjectRowChange,
	type SubjectRowUpdate,
	subjectRowIdOf,
} from "@autumn/postgres";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import {
	StaleSubjectRowsError,
	UnsupportedRowChangeError,
} from "../committerErrors.js";
import type {
	CommitterContext,
	Flush,
	FlushCall,
	FlushOutcome,
} from "../types/committer.js";

const definedNumbers = (record: Record<string, number | undefined>) =>
	Object.fromEntries(
		Object.entries(record).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, value]],
		),
	);

type BalanceTable = SubjectRowChange["table"];
type BalanceRowChange = Extract<RowChange, { table: BalanceTable }>;

const isBalanceTable = (table: RowChange["table"]): table is BalanceTable =>
	table === "customerEntitlements" ||
	table === "rollovers" ||
	table === "usageWindows" ||
	table === "pooledBalances" ||
	table === "locks";

/** An increment adds its counters; an update replaces its columns under the before guard. */
const balanceRowChangeToUpdate = ({
	change,
}: {
	change: Extract<BalanceRowChange, { op: "update" | "increment" }>;
}): SubjectRowUpdate => {
	if (change.op === "update") {
		return {
			table: change.table,
			id: change.id,
			set: change.after,
			add: {},
			addEntries: {},
			guard: change.before,
		};
	}
	const entries: Record<
		string,
		Record<string, Record<string, number | undefined>> | undefined
	> = change.addEntries ?? {};
	return {
		table: change.table,
		id: change.id,
		set: {},
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

/** The change as Postgres lands it; only the balance tables and their locks land today, the subject and plan rows wait for attach. */
const rowChangeToSubjectRowChange = ({
	change,
}: {
	change: RowChange;
}): SubjectRowChange => {
	if (!isBalanceTable(change.table)) {
		throw new UnsupportedRowChangeError({ table: change.table, op: change.op });
	}
	const balanceChange = change as BalanceRowChange;
	switch (balanceChange.op) {
		case "insert":
			return {
				op: "insert",
				table: balanceChange.table,
				row: balanceChange.row,
			};
		case "delete":
			return { op: "delete", table: balanceChange.table, id: balanceChange.id };
		case "update":
		case "increment":
			return {
				op: "update",
				...balanceRowChangeToUpdate({ change: balanceChange }),
			};
	}
};

/** Which records touched each change, so a row that did not land names the mutations it belonged to. */
const collectChanges = ({
	flush,
}: {
	flush: Flush;
}): { changes: SubjectRowChange[]; recordOf: DurableMutationRecord[] } => {
	const changes: SubjectRowChange[] = [];
	const recordOf: DurableMutationRecord[] = [];
	for (const call of flush.calls) {
		for (const record of call.records) {
			for (const change of record.mutation.changes) {
				changes.push(rowChangeToSubjectRowChange({ change }));
				recordOf.push(record);
			}
		}
	}
	return { changes, recordOf };
};

/** The command bookmark follows the last consumed command in the call; calls without one leave it where it is. */
const commandNextOffsetOf = ({
	call,
}: {
	call: FlushCall;
}): bigint | undefined => {
	for (let index = call.records.length - 1; index >= 0; index--) {
		const source = call.records[index]?.mutation.source;
		if (source) return BigInt(source.commandOffset) + 1n;
	}
	return call.commandNextOffset;
};

const bookmarkOf = ({ call }: { call: FlushCall }): FlushBookmark | null => {
	const last = call.records.at(-1);
	if (!last && call.commandNextOffset === undefined) return null;
	return {
		topic: call.topic,
		partition: call.partition,
		expectedOffset: call.expectedOffset,
		nextOffset: last ? last.position.offset + 1n : call.expectedOffset,
		commandNextOffset: commandNextOffsetOf({ call }),
	};
};

/** One transaction for the whole flush: every call's row updates, then every call's bookmark. */
export const runFlush = async ({
	ctx,
	flush,
}: {
	ctx: CommitterContext;
	flush: Flush;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	const outcomes = new Map<FlushCall, FlushOutcome>();
	const bookmarks: FlushBookmark[] = [];
	for (const call of flush.calls) {
		const bookmark = bookmarkOf({ call });
		outcomes.set(call, {
			nextOffset: bookmark?.nextOffset ?? call.expectedOffset,
			commandNextOffset: bookmark?.commandNextOffset,
		});
		if (bookmark) bookmarks.push(bookmark);
	}
	const { changes, recordOf } = collectChanges({ flush });

	const { applied } = await ctx.db.flush({ changes, bookmarks });
	const staleIds = changes
		.filter((_, index) => !applied[index])
		.map(
			(change, index) =>
				`${subjectRowIdOf(change)} (${recordOf[index]?.mutation.id})`,
		);
	if (staleIds.length > 0) throw new StaleSubjectRowsError({ ids: staleIds });
	return outcomes;
};
