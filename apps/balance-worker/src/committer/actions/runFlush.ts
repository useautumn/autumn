import type { MutationCommand, RowChange } from "@autumn/balance-engine";
import { BALANCE_WORKER_COMMITTER_GUARDS_ENABLED } from "@autumn/env/balanceWorkerConstants";
import {
	type FlushBookmark,
	type SubjectRowChange,
	type SubjectRowTable,
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

type BalanceTable =
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows"
	| "pooledBalances"
	| "locks";
type BalanceRowChange = Extract<RowChange, { table: BalanceTable }>;

const isBalanceTable = (table: RowChange["table"]): table is BalanceTable =>
	table === "customerEntitlements" ||
	table === "rollovers" ||
	table === "usageWindows" ||
	table === "pooledBalances" ||
	table === "locks";

/** An update replaces its columns; with guards on, under its `before` unless a billing plan's, which lands last-write-wins. */
const updateToSubjectRowUpdate = ({
	table,
	change,
	commandType,
}: {
	table: SubjectRowTable;
	change: { id: string; before: object; after: object };
	commandType: MutationCommand["type"];
}): SubjectRowUpdate => ({
	table,
	id: change.id,
	set: { ...change.after },
	add: {},
	addEntries: {},
	// `before` stays on the log for its readers either way.
	guard:
		BALANCE_WORKER_COMMITTER_GUARDS_ENABLED &&
		commandType !== "applyBillingPlan"
			? { ...change.before }
			: {},
});

/** An increment adds its counters; with guards on, only while the row is still in the cycle it names. */
const incrementToSubjectRowUpdate = ({
	change,
}: {
	change: Extract<BalanceRowChange, { op: "increment" }>;
}): SubjectRowUpdate => {
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
		guard: BALANCE_WORKER_COMMITTER_GUARDS_ENABLED ? (change.guard ?? {}) : {},
	};
};

/** The subject's own rows: only a billing plan changes them. */
const PLAN_TABLES = {
	customer: "customers",
	entity: "entities",
	customerProducts: "customerProducts",
	customerPrices: "customerPrices",
	pooledContributions: "pooledContributions",
} as const satisfies Partial<Record<RowChange["table"], SubjectRowTable>>;

type PlanTable = keyof typeof PLAN_TABLES;
type PlanRowChange = Exclude<
	Extract<RowChange, { table: PlanTable }>,
	{ op: "promote" }
>;

const isPlanRowChange = (change: RowChange): change is PlanRowChange =>
	change.table in PLAN_TABLES && change.op !== "promote";

const planRowChangeToSubjectRowChange = ({
	change,
}: {
	change: PlanRowChange;
}): SubjectRowChange => {
	const table = PLAN_TABLES[change.table];
	switch (change.op) {
		case "insert":
			return { op: "insert", table, row: change.row };
		case "update":
			return {
				op: "update",
				...updateToSubjectRowUpdate({
					table,
					change,
					commandType: "applyBillingPlan",
				}),
			};
		case "delete":
			return { op: "delete", table, id: change.id };
	}
};

/** The change as Postgres lands it: the balance tables and their locks, and a billing plan's changes to the subject's own rows. */
const rowChangeToSubjectRowChange = ({
	change,
	commandType,
}: {
	change: RowChange;
	commandType: MutationCommand["type"];
}): SubjectRowChange => {
	// A reset's promote is set-based over rows the worker never holds; Postgres applies it as one statement.
	if (change.table === "pooledContributions" && change.op === "promote")
		return {
			op: "promote",
			table: "pooledContributions",
			pooledBalanceId: change.pooledBalanceId,
			dueBy: change.dueBy,
		};
	if (isPlanRowChange(change)) {
		// An initialize's rows are Postgres's own baseline; only a plan brings rows Postgres lacks.
		if (commandType !== "applyBillingPlan")
			throw new UnsupportedRowChangeError({
				table: change.table,
				op: change.op,
			});
		return planRowChangeToSubjectRowChange({ change });
	}
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
			return {
				op: "update",
				...updateToSubjectRowUpdate({
					table: balanceChange.table,
					change: balanceChange,
					commandType,
				}),
			};
		case "increment":
			return {
				op: "update",
				...incrementToSubjectRowUpdate({ change: balanceChange }),
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
				changes.push(
					rowChangeToSubjectRowChange({
						change,
						commandType: record.mutation.command.type,
					}),
				);
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
