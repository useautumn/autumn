import type {
	CustomerEntitlementIncrement,
	RolloverIncrement,
	RowChange,
} from "../models/mutation/rowChange.js";
import type { AnyRowIncrement } from "../models/mutation/rowIncrement.js";
import { incrementRow } from "../mutation/incrementRow.js";
import { engineDiet } from "../utils/engineDiet/engineDiet.js";
import { advanceDeductionContextLean } from "./advanceDeductionContextLean.js";
import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionRow } from "./types/deductionRow.js";

type BalanceIncrement = CustomerEntitlementIncrement | RolloverIncrement;

/** The counters a draw moves: a row's own balance, its entity balances, and its rate-card attribution. */
const MOVED_COUNTERS = {
	customerEntitlements: {
		add: ["balance"],
		entries: ["entities", "usage_attribution"],
	},
	rollovers: { add: ["balance", "usage"], entries: ["entities"] },
} as const;

const isSubsetOf = (keys: string[], allowed: readonly string[]): boolean =>
	keys.every((key) => allowed.includes(key));

/** An increment of draw counters on an entitlement or rollover: nothing that selects or bounds a row moves. */
const isBalanceIncrement = (change: RowChange): change is BalanceIncrement => {
	if (change.table !== "customerEntitlements" && change.table !== "rollovers")
		return false;
	if (change.op !== "increment" || change.guard) return false;
	const counters = MOVED_COUNTERS[change.table];
	const entries = change.addEntries ?? {};
	const entityCounters = Object.values(
		(entries as { entities?: Record<string, object> }).entities ?? {},
	).flatMap((entry) => Object.keys(entry));
	return (
		isSubsetOf(Object.keys(change.add), counters.add) &&
		isSubsetOf(Object.keys(entries), counters.entries) &&
		isSubsetOf(entityCounters, counters.add)
	);
};

const applyIncrements = <Row extends { id: string }>({
	row,
	changes,
}: {
	row: Row;
	changes: BalanceIncrement[];
}): Row => {
	let next = row;
	for (const change of changes)
		if (change.id === row.id)
			next = incrementRow({
				row: next,
				change: change as unknown as AnyRowIncrement<Row>,
			});
	return next;
};

/**
 * The context `setupDeductionContext` would find once `changes` apply, derived without reading the subject;
 * null when a change could move which rows are selected or how they are bounded. Advance by the changes a mutation
 * applied, never a refused draw's deltas; each row's plan keeps its own stale copy of its rows, which no draw reads.
 */
export const advanceDeductionContext = ({
	context,
	changes,
}: {
	context: DeductionContext;
	changes: RowChange[];
}): DeductionContext | null => {
	if (engineDiet.advanceContext)
		return advanceDeductionContextLean({ context, changes });
	if (!changes.every(isBalanceIncrement)) return null;
	// A gate shares out the remaining balance, so it is resolved against the rows as they stood.
	if (changes.length > 0 && context.allocationGates.size > 0) return null;
	const increments = changes as BalanceIncrement[];
	const entitlementChanges = increments.filter(
		(change) => change.table === "customerEntitlements",
	);
	const rolloverChanges = increments.filter(
		(change) => change.table === "rollovers",
	);
	const touchesRow = ({
		row,
		rowChanges,
	}: {
		row: { id: string };
		rowChanges: BalanceIncrement[];
	}) => rowChanges.some((change) => change.id === row.id);
	const touchesContext =
		context.customerEntitlements.some((row) =>
			touchesRow({ row, rowChanges: entitlementChanges }),
		) ||
		context.rollovers.some((row) =>
			touchesRow({ row, rowChanges: rolloverChanges }),
		);
	// Rows this context never selected moved: nothing it reads changed.
	if (!touchesContext) return context;

	const rollovers = context.rollovers.map((row) =>
		applyIncrements({ row, changes: rolloverChanges }),
	);
	const customerEntitlements = context.customerEntitlements.map((row) => {
		const touchesRollovers = row.rollovers.some((rollover) =>
			touchesRow({ row: rollover, rowChanges: rolloverChanges }),
		);
		const next = applyIncrements({ row, changes: entitlementChanges });
		if (!touchesRollovers) return next;
		return {
			...next,
			rollovers: next.rollovers.map((rollover) =>
				applyIncrements({ row: rollover, changes: rolloverChanges }),
			),
		};
	});
	const entitlementById = new Map(
		customerEntitlements.map((row) => [row.id, row]),
	);
	const rolloverById = new Map(rollovers.map((row) => [row.id, row]));

	const rows = context.rows.map((row): DeductionRow => {
		const customerEntitlement = entitlementById.get(row.id);
		if (
			!touchesRow({ row, rowChanges: entitlementChanges }) ||
			!customerEntitlement
		)
			return row;
		return {
			...row,
			balance:
				row.entityKey === null
					? customerEntitlement.balance
					: (customerEntitlement.entities?.[row.entityKey]?.balance ?? 0),
			rateUnits: row.rateCard
				? (customerEntitlement.usage_attribution?.[
						row.rateCard.source_internal_feature_id
					]?.units ?? 0)
				: 0,
		};
	});
	const ownerOf = (rolloverRow: DeductionRow) =>
		rows.find(
			(row) =>
				row.id === rolloverRow.ownerId &&
				row.entityKey === rolloverRow.entityKey,
		);
	const rolloverRows = context.rolloverRows.map((row): DeductionRow => {
		const rollover = rolloverById.get(row.id);
		const owner = ownerOf(row);
		const moved =
			touchesRow({ row, rowChanges: rolloverChanges }) ||
			(owner !== undefined && owner.rateUnits !== row.rateUnits);
		if (!moved || !rollover) return row;
		return {
			...row,
			balance:
				row.entityKey === null
					? rollover.balance
					: (rollover.entities[row.entityKey]?.balance ?? 0),
			rateUnits: owner?.rateUnits ?? row.rateUnits,
		};
	});

	return { ...context, customerEntitlements, rollovers, rows, rolloverRows };
};
