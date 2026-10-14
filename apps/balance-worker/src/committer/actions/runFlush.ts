import {
	type MutationCommand,
	meteringIdentityToPartitionKey,
	type RowChange,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_COMMITTER_GUARDS_ENABLED } from "@autumn/env/balanceWorkerConstants";
import {
	type DeletedSubjectSnapshot,
	type FlushBookmark,
	type SubjectRowChange,
	type SubjectRowTable,
	type SubjectRowUpdate,
	subjectRowIdOf,
} from "@autumn/postgres";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import type { DurableMutationRecord } from "../../state/types/durableMutation.js";
import {
	StaleSubjectRowsError,
	UnsupportedRowChangeError,
} from "../committerErrors.js";
import { collectSnapshotWrites } from "../subjectSnapshots/collectSnapshotWrites.js";
import type {
	CommitterConfig,
	CommitterContext,
	Flush,
	FlushCall,
	FlushOutcome,
} from "../types/committer.js";
import { keepKnownColumns } from "./keepKnownColumns.js";

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
	guard:
		(commandType === "reset" && table === "customerEntitlements") ||
		(BALANCE_WORKER_COMMITTER_GUARDS_ENABLED &&
			commandType !== "applyBillingPlan")
			? { ...change.before }
			: {},
});

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

const rowChangeToSubjectRowChange = ({
	change,
	commandType,
}: {
	change: RowChange;
	commandType: MutationCommand["type"];
}): SubjectRowChange => {
	if (change.table === "pooledContributions" && change.op === "promote")
		return {
			op: "promote",
			table: "pooledContributions",
			pooledBalanceId: change.pooledBalanceId,
			dueBy: change.dueBy,
		};
	if (isPlanRowChange(change)) {
		if (commandType === "initialize")
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
				const known = keepKnownColumns({
					change: rowChangeToSubjectRowChange({
						change,
						commandType: record.mutation.command.type,
					}),
				});
				if (known === null) continue;
				changes.push(known);
				recordOf.push(record);
			}
		}
	}
	return { changes, recordOf };
};

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
	if (
		!last &&
		call.commandNextOffset === undefined &&
		call.ownerFence === undefined &&
		!writesSnapshotRows({ call })
	)
		return null;
	return {
		topic: call.topic,
		partition: call.partition,
		expectedOffset: call.expectedOffset,
		nextOffset: last ? last.position.offset + 1n : call.expectedOffset,
		commandNextOffset: commandNextOffsetOf({ call }),
		ownerFence: call.ownerFence,
		claimToken: call.claimToken,
	};
};

export const flushLandedEarlier = async ({
	ctx,
	flush,
}: {
	ctx: CommitterContext;
	flush: Flush;
}): Promise<Map<FlushCall, FlushOutcome> | null> => {
	const outcomes = new Map<FlushCall, FlushOutcome>();
	for (const call of flush.calls) {
		const bookmark = bookmarkOf({ call });
		if (!bookmark) {
			outcomes.set(call, { nextOffset: call.expectedOffset });
			continue;
		}
		const stored = await ctx.db
			.readPartitionProgress({ topic: call.topic, partition: call.partition })
			.catch(() => null);
		if (!stored || stored.nextOffset !== bookmark.nextOffset) return null;
		if (call.claimToken !== undefined && stored.claimToken !== call.claimToken)
			return null;
		outcomes.set(call, {
			nextOffset: bookmark.nextOffset,
			commandNextOffset: bookmark.commandNextOffset,
			ownerFence: bookmark.ownerFence,
		});
	}
	return outcomes;
};

export const runFlush = async ({
	ctx,
	config,
	flush,
}: {
	ctx: CommitterContext;
	config: Pick<CommitterConfig, "snapshots">;
	flush: Flush;
}): Promise<Map<FlushCall, FlushOutcome>> => {
	const outcomes = new Map<FlushCall, FlushOutcome>();
	const bookmarks: FlushBookmark[] = [];
	for (const call of flush.calls) {
		const bookmark = bookmarkOf({ call });
		outcomes.set(call, {
			nextOffset: bookmark?.nextOffset ?? call.expectedOffset,
			commandNextOffset: bookmark?.commandNextOffset,
			ownerFence: bookmark?.ownerFence,
		});
		if (bookmark) bookmarks.push(bookmark);
	}
	const { changes, recordOf } = timeSync({ label: "flush.collect" }, () =>
		collectChanges({ flush }),
	);

	const snapshots = timeSync({ label: "flush.snapshots" }, () =>
		collectSnapshotWrites({ ctx, config, flush }),
	);
	const { applied, snapshots: landed } = await ctx.db.flush({
		changes,
		bookmarks,
		...(snapshots && { snapshots }),
	});
	if (landed)
		attributeDeletedSnapshots({ flush, outcomes, deleted: landed.deleted });
	const staleRows = staleRowsOf({ changes, applied, recordOf });
	if (staleRows.length > 0)
		throw new StaleSubjectRowsError({ rows: staleRows });
	return outcomes;
};

const staleRowsOf = ({
	changes,
	applied,
	recordOf,
}: {
	changes: SubjectRowChange[];
	applied: boolean[];
	recordOf: DurableMutationRecord[];
}): { id: string; record: DurableMutationRecord }[] => {
	const rowOf = (change: SubjectRowChange) =>
		`${change.table}:${subjectRowIdOf(change)}`;
	const isGuarded = (change: SubjectRowChange) =>
		change.op === "update" && Object.keys(change.guard).length > 0;
	const guardMissed = new Set(
		changes.flatMap((change, index) =>
			!applied[index] && isGuarded(change) ? [rowOf(change)] : [],
		),
	);
	return changes.flatMap((change, index) => {
		const record = recordOf[index];
		if (applied[index] || !record) return [];
		if (guardMissed.has(rowOf(change)) && !isGuarded(change)) return [];
		return [{ id: subjectRowIdOf(change), record }];
	});
};

const attributeDeletedSnapshots = ({
	flush,
	outcomes,
	deleted,
}: {
	flush: Flush;
	outcomes: Map<FlushCall, FlushOutcome>;
	deleted: readonly DeletedSubjectSnapshot[];
}): void => {
	if (deleted.length === 0) return;
	const callByCustomer = new Map<string, FlushCall>();
	for (const call of flush.calls)
		for (const [customerKey, entry] of call.snapshotIntent ?? [])
			if (entry === "delete") callByCustomer.set(customerKey, call);
	for (const row of deleted) {
		const call = callByCustomer.get(
			meteringIdentityToPartitionKey({ identity: { ...row, entityId: null } }),
		);
		const outcome = call && outcomes.get(call);
		if (!outcome) continue;
		outcome.deletedSnapshots ??= [];
		outcome.deletedSnapshots.push(row);
	}
};

export const writesSnapshotRows = ({ call }: { call: FlushCall }): boolean =>
	[...(call.snapshotIntent?.values() ?? [])].some(
		(entry) => entry !== "delete",
	);
