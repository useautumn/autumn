import { Decimal } from "decimal.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import { isExactInteger } from "../../utils/numberUtils/exactIntegerUtils.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionDelta } from "../types/deductionDelta.js";
import {
	customerEntitlementChangeOf,
	rolloverChangeOf,
} from "./convertDeductionUtils.js";

type Table = DeductionDelta["table"];

/** `sumToNumber` over the matching deltas without materialising them: plain when every value is an exact integer. */
const sumOnRow = ({
	table,
	id,
	deltas,
	amountOf,
}: {
	table: Table;
	id: string;
	deltas: DeductionDelta[];
	amountOf: (delta: DeductionDelta) => number;
}): number | undefined => {
	let total = 0;
	let any = false;
	let exact = true;
	for (const delta of deltas) {
		if (delta.table !== table || delta.id !== id || delta.entityKey !== null)
			continue;
		const value = amountOf(delta);
		any = true;
		if (!isExactInteger(value)) exact = false;
		total += value;
	}
	if (!any) return undefined;
	if (!exact) {
		let decimal = new Decimal(0);
		for (const delta of deltas)
			if (delta.table === table && delta.id === id && delta.entityKey === null)
				decimal = decimal.plus(amountOf(delta));
		total = decimal.toNumber();
	}
	return total === 0 ? undefined : total;
};

/** A row only its own balance moved: no entity balance, no rate-card attribution named it. */
const isPlainRow = ({
	table,
	id,
	deltas,
}: {
	table: Table;
	id: string;
	deltas: DeductionDelta[];
}): boolean => {
	for (const delta of deltas) {
		if (delta.table === table && delta.id === id && delta.entityKey !== null)
			return false;
		if (
			table === "customerEntitlements" &&
			delta.usageAttributionDelta?.customerEntitlementId === id
		)
			return false;
	}
	return true;
};

const hasDeltaOn = ({
	table,
	id,
	deltas,
}: {
	table: Table;
	id: string;
	deltas: DeductionDelta[];
}): boolean => {
	for (const delta of deltas)
		if (delta.table === table && delta.id === id) return true;
	return false;
};

/** Selected rows in draw order, then rows only a delta names, each once; `visit` returns the change to keep. */
const eachRowToChange = ({
	table,
	selectedIds,
	deltas,
	visit,
}: {
	table: Table;
	selectedIds: string[];
	deltas: DeductionDelta[];
	visit: (id: string) => RowChange | null;
}): RowChange[] => {
	const changes: RowChange[] = [];
	for (const id of selectedIds) {
		const change = visit(id);
		if (change) changes.push(change);
	}
	for (let index = 0; index < deltas.length; index++) {
		const delta = deltas[index] as DeductionDelta;
		if (delta.table !== table || selectedIds.includes(delta.id)) continue;
		let seen = false;
		for (let earlier = 0; earlier < index; earlier++) {
			const other = deltas[earlier] as DeductionDelta;
			if (other.table === table && other.id === delta.id) {
				seen = true;
				break;
			}
		}
		if (seen) continue;
		const change = visit(delta.id);
		if (change) changes.push(change);
	}
	return changes;
};

/**
 * `deltasToRowChanges` with the same rows in the same order and the same change objects, without the
 * per-row filter, map, Set and entries churn: a plain row (no entity balances, no attribution) sums in
 * one pass; anything richer takes the baseline's own per-row builder.
 */
export const deltasToRowChangesLean = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): RowChange[] => {
	const entitlementChanges = eachRowToChange({
		table: "customerEntitlements",
		selectedIds: context.customerEntitlements.map((row) => row.id),
		deltas,
		visit: (id) => {
			if (!isPlainRow({ table: "customerEntitlements", id, deltas }))
				return customerEntitlementChangeOf({ id, deltas });
			const balance = sumOnRow({
				table: "customerEntitlements",
				id,
				deltas,
				amountOf: (delta) => delta.balanceDelta,
			});
			if (balance === undefined) return null;
			return {
				table: "customerEntitlements",
				op: "increment",
				id,
				add: { balance },
			};
		},
	});
	const rolloverChanges = eachRowToChange({
		table: "rollovers",
		selectedIds: context.rollovers.map((row) => row.id),
		deltas,
		visit: (id) => {
			if (!hasDeltaOn({ table: "rollovers", id, deltas })) return null;
			if (!isPlainRow({ table: "rollovers", id, deltas }))
				return rolloverChangeOf({ id, deltas });
			const balance = sumOnRow({
				table: "rollovers",
				id,
				deltas,
				amountOf: (delta) => delta.balanceDelta,
			});
			const usage = sumOnRow({
				table: "rollovers",
				id,
				deltas,
				amountOf: (delta) => delta.usageDelta,
			});
			if (balance === undefined && usage === undefined) return null;
			const add: { balance?: number; usage?: number } = {};
			if (balance !== undefined) add.balance = balance;
			if (usage !== undefined) add.usage = usage;
			return { table: "rollovers", op: "increment", id, add };
		},
	});
	return entitlementChanges.length === 0
		? rolloverChanges
		: rolloverChanges.length === 0
			? entitlementChanges
			: [...entitlementChanges, ...rolloverChanges];
};
