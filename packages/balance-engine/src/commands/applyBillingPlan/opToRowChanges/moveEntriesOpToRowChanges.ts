import { StaleMutationError } from "../../../errors.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { BillingPlanMoveEntriesOp } from "../types/billingPlanOp.js";
import {
	findPlanRow,
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";

type EntityEntries = NonNullable<
	NonNullable<
		PlanRowChangeContext["state"]
	>["customerEntitlements"][number]["entities"]
>;

/** Each present `from` entry becomes the `to` entry (its `id` updated); a missing `from` moves nothing. */
const moveEntries = ({
	entries,
	moves,
}: {
	entries: EntityEntries;
	moves: Record<string, string>;
}): EntityEntries => {
	const moved: EntityEntries = { ...entries };
	for (const [from, to] of Object.entries(moves)) {
		const entry = entries[from];
		if (!entry) continue;
		delete moved[from];
		moved[to] = { ...entry, id: to };
	}
	return moved;
};

/** Resolved in `decide` against the freshest map, so the log carries the concrete before → after. */
export const moveEntriesOpToRowChanges = ({
	op,
	context,
}: {
	op: BillingPlanMoveEntriesOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (wasDeletedByPlan({ context, table: op.table, id: op.id })) return [];
	const row = findPlanRow({ context, table: op.table, id: op.id });
	if (!row) throw new StaleMutationError({ subject: op.id });

	const entries = row.entities ?? {};
	const moved = moveEntries({ entries, moves: op.moves });
	if (Object.keys(op.moves).every((from) => !(from in entries))) return [];
	return [
		{
			table: op.table,
			op: "update",
			id: op.id,
			before: { entities: row.entities },
			after: { entities: moved },
		},
	];
};
