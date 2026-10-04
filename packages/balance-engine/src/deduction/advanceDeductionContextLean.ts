import type {
	CustomerEntitlementIncrement,
	RolloverIncrement,
	RowChange,
} from "../models/mutation/rowChange.js";
import type { AnyRowIncrement } from "../models/mutation/rowIncrement.js";
import { incrementRow } from "../mutation/incrementRow.js";
import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionRow } from "./types/deductionRow.js";

type BalanceIncrement = CustomerEntitlementIncrement | RolloverIncrement;
type Table = "customerEntitlements" | "rollovers";

const ADD_COUNTERS: Record<Table, readonly string[]> = {
	customerEntitlements: ["balance"],
	rollovers: ["balance", "usage"],
};
const ENTRY_COUNTERS: Record<Table, readonly string[]> = {
	customerEntitlements: ["entities", "usage_attribution"],
	rollovers: ["entities"],
};

const keysWithin = (
	value: object | undefined,
	allowed: readonly string[],
): boolean => {
	if (!value) return true;
	for (const key in value) if (!allowed.includes(key)) return false;
	return true;
};

/** `isBalanceIncrement` without the key and value arrays: nothing that selects or bounds a row moves. */
const isBalanceIncrement = (change: RowChange): boolean => {
	if (change.table !== "customerEntitlements" && change.table !== "rollovers")
		return false;
	if (change.op !== "increment" || change.guard) return false;
	const table = change.table;
	if (!keysWithin(change.add, ADD_COUNTERS[table])) return false;
	const entries = change.addEntries as
		| { entities?: Record<string, object> }
		| undefined;
	if (!keysWithin(entries, ENTRY_COUNTERS[table])) return false;
	const entities = entries?.entities;
	if (entities)
		for (const key in entities)
			if (!keysWithin(entities[key], ADD_COUNTERS[table])) return false;
	return true;
};

const touchesId = ({
	id,
	table,
	changes,
}: {
	id: string;
	table: Table;
	changes: BalanceIncrement[];
}): boolean => {
	for (const change of changes)
		if (change.table === table && change.id === id) return true;
	return false;
};

/** Every increment on the row applied in order, as `applyIncrements` does. */
const incremented = <Row extends { id: string }>({
	row,
	table,
	changes,
}: {
	row: Row;
	table: Table;
	changes: BalanceIncrement[];
}): Row => {
	let next = row;
	for (const change of changes)
		if (change.table === table && change.id === row.id)
			next = incrementRow({
				row: next,
				change: change as unknown as AnyRowIncrement<Row>,
			});
	return next;
};

const findById = <Row extends { id: string }>(
	rows: Row[],
	id: string,
): Row | undefined => {
	for (const row of rows) if (row.id === id) return row;
	return undefined;
};

/**
 * `advanceDeductionContext` with the same result and without its per-call filter arrays, maps and
 * closures: untouched rows keep their identity, touched ones are rebuilt the way the baseline rebuilds them.
 */
export const advanceDeductionContextLean = ({
	context,
	changes,
}: {
	context: DeductionContext;
	changes: RowChange[];
}): DeductionContext | null => {
	for (const change of changes) if (!isBalanceIncrement(change)) return null;
	if (changes.length > 0 && context.allocationGates.size > 0) return null;
	const increments = changes as BalanceIncrement[];
	let touchesContext = false;
	for (const row of context.customerEntitlements)
		if (
			touchesId({
				id: row.id,
				table: "customerEntitlements",
				changes: increments,
			})
		) {
			touchesContext = true;
			break;
		}
	if (!touchesContext)
		for (const row of context.rollovers)
			if (touchesId({ id: row.id, table: "rollovers", changes: increments })) {
				touchesContext = true;
				break;
			}
	if (!touchesContext) return context;

	const rollovers = context.rollovers.map((row) =>
		incremented({ row, table: "rollovers", changes: increments }),
	);
	const customerEntitlements = context.customerEntitlements.map((row) => {
		let touchesRollovers = false;
		for (const rollover of row.rollovers)
			if (
				touchesId({ id: rollover.id, table: "rollovers", changes: increments })
			) {
				touchesRollovers = true;
				break;
			}
		const next = incremented({
			row,
			table: "customerEntitlements",
			changes: increments,
		});
		if (!touchesRollovers) return next;
		return {
			...next,
			rollovers: next.rollovers.map((rollover) =>
				incremented({ row: rollover, table: "rollovers", changes: increments }),
			),
		};
	});

	const rows = context.rows.map((row): DeductionRow => {
		if (
			!touchesId({
				id: row.id,
				table: "customerEntitlements",
				changes: increments,
			})
		)
			return row;
		const customerEntitlement = findById(customerEntitlements, row.id);
		if (!customerEntitlement) return row;
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
	const rolloverRows = context.rolloverRows.map((row): DeductionRow => {
		let owner: DeductionRow | undefined;
		for (const candidate of rows)
			if (
				candidate.id === row.ownerId &&
				candidate.entityKey === row.entityKey
			) {
				owner = candidate;
				break;
			}
		const moved =
			touchesId({ id: row.id, table: "rollovers", changes: increments }) ||
			(owner !== undefined && owner.rateUnits !== row.rateUnits);
		if (!moved) return row;
		const rollover = findById(rollovers, row.id);
		if (!rollover) return row;
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
