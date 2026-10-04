import type { RowChange } from "../models/mutation/rowChange.js";
import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionDelta } from "./types/deductionDelta.js";
import type { DeductionOutcome } from "./types/deductionOutcome.js";
import type { DeductionRequest } from "./types/deductionRequest.js";

/** Selected ids in draw order, then any other id a delta names: `rowIdsToChange` without the Set. */
const idsToChange = ({
	table,
	selectedIds,
	deltas,
}: {
	table: DeductionDelta["table"];
	selectedIds: readonly { id: string }[];
	deltas: DeductionDelta[];
}): string[] => {
	const ids: string[] = [];
	for (const { id } of selectedIds) if (!ids.includes(id)) ids.push(id);
	for (const delta of deltas)
		if (delta.table === table && !ids.includes(delta.id)) ids.push(delta.id);
	return ids;
};

/** Every delta on the row summed, or undefined when there is none or it nets to zero. */
const sumOn = ({
	table,
	id,
	deltas,
	field,
}: {
	table: DeductionDelta["table"];
	id: string;
	deltas: DeductionDelta[];
	field: "balanceDelta" | "usageDelta";
}): number | undefined => {
	let total = 0;
	for (const delta of deltas)
		if (delta.table === table && delta.id === id) total += delta[field];
	return total === 0 ? undefined : total;
};

const touches = ({
	table,
	id,
	deltas,
}: {
	table: DeductionDelta["table"];
	id: string;
	deltas: DeductionDelta[];
}): boolean => deltas.some((delta) => delta.table === table && delta.id === id);

/**
 * The outcome `deductionStateToOutcome` gives an integer draw that covered the whole value on the rows' own balances,
 * built in plain numbers; null when the draw fell short or moved an entity balance, which take the general path.
 */
export const integerDrawOutcome = ({
	context,
	request,
	remaining,
	deltas,
}: {
	context: DeductionContext;
	request: DeductionRequest;
	remaining: number;
	deltas: DeductionDelta[];
}): DeductionOutcome | null => {
	if (remaining !== 0) return null;
	for (const delta of deltas) if (delta.entityKey !== null) return null;
	const changes: RowChange[] = [];
	for (const id of idsToChange({
		table: "customerEntitlements",
		selectedIds: context.customerEntitlements,
		deltas,
	})) {
		const balance = sumOn({
			table: "customerEntitlements",
			id,
			deltas,
			field: "balanceDelta",
		});
		if (balance === undefined) continue;
		changes.push({
			table: "customerEntitlements",
			op: "increment",
			id,
			add: { balance },
		});
	}
	for (const id of idsToChange({
		table: "rollovers",
		selectedIds: context.rollovers,
		deltas,
	})) {
		if (!touches({ table: "rollovers", id, deltas })) continue;
		const balance = sumOn({
			table: "rollovers",
			id,
			deltas,
			field: "balanceDelta",
		});
		const usage = sumOn({
			table: "rollovers",
			id,
			deltas,
			field: "usageDelta",
		});
		if (balance === undefined && usage === undefined) continue;
		changes.push({
			table: "rollovers",
			op: "increment",
			id,
			add: {
				...(balance === undefined ? {} : { balance }),
				...(usage === undefined ? {} : { usage }),
			},
		});
	}
	return {
		context,
		requestedValue: request.value,
		appliedValue: request.value,
		remaining: 0,
		rejected: false,
		limitType: null,
		deltas,
		usageWindowConsumed: new Map(),
		allocationConsumed: undefined,
		changes,
	};
};
