import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { BillingPlanIncrementOp } from "../types/billingPlanOp.js";
import {
	type PlanRowChangeContext,
	wasDeletedByPlan,
} from "./planRowChangeContext.js";

/** Unguarded: a rebalance's delta lands on whatever the grant holds by then, as the Postgres lane's `balance + delta`. */
export const incrementOpToRowChanges = ({
	op,
	context,
}: {
	op: BillingPlanIncrementOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (wasDeletedByPlan({ context, table: op.table, id: op.id })) return [];
	return [
		{
			table: op.table,
			op: "increment",
			id: op.id,
			add: op.add,
			...(op.addEntries ? { addEntries: op.addEntries } : {}),
		},
	];
};
