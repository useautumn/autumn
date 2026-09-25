import type { RowChange } from "../../../models/mutation/rowChange.js";
import type {
	BillingPlanInsertOp,
	BillingPlanRowOp,
} from "../types/billingPlanOp.js";
import { deleteOpToRowChanges } from "./deleteOpToRowChanges.js";
import { incrementOpToRowChanges } from "./incrementOpToRowChanges.js";
import { moveEntriesOpToRowChanges } from "./moveEntriesOpToRowChanges.js";
import type { PlanRowChangeContext } from "./planRowChangeContext.js";
import { contributionOpToRowChanges } from "./pooled/contributionOpToRowChanges.js";
import { updateOpToRowChanges } from "./updateOpToRowChanges.js";

/** An insert carries its row; later ops of the plan find the row through the context. */
const insertOpToRowChanges = ({
	op,
	context,
}: {
	op: BillingPlanInsertOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (op.table === "customerEntitlements")
		context.insertedRows.customerEntitlements.push(op.row);
	if (op.table === "pooledBalances")
		context.insertedRows.pooledBalances.push(op.row);
	return [op];
};

/** One op as the row changes it makes: an insert carries its row, the rest read the rows as found. */
export const opToRowChanges = ({
	op,
	context,
}: {
	op: BillingPlanRowOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	if (op.table === "pooledContributions")
		return contributionOpToRowChanges({ op, context });
	switch (op.op) {
		case "insert":
			return insertOpToRowChanges({ op, context });
		case "update":
			return updateOpToRowChanges({ op, context });
		case "delete":
			return deleteOpToRowChanges({ op, context });
		case "increment":
			return incrementOpToRowChanges({ op, context });
		case "moveEntries":
			return moveEntriesOpToRowChanges({ op, context });
	}
};
