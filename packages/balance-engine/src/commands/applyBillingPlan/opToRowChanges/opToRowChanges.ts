import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { BillingPlanOp } from "../types/billingPlanOp.js";
import { deleteOpToRowChanges } from "./deleteOpToRowChanges.js";
import { incrementOpToRowChanges } from "./incrementOpToRowChanges.js";
import type { PlanRowChangeContext } from "./planRowChangeContext.js";
import { updateOpToRowChanges } from "./updateOpToRowChanges.js";

/** One op as the row changes it makes: an insert carries its row, the rest read the rows as found. */
export const opToRowChanges = ({
	op,
	context,
}: {
	op: BillingPlanOp;
	context: PlanRowChangeContext;
}): RowChange[] => {
	switch (op.op) {
		case "insert":
			return [op];
		case "update":
			return updateOpToRowChanges({ op, context });
		case "delete":
			return deleteOpToRowChanges({ op, context });
		case "increment":
			return incrementOpToRowChanges({ op, context });
	}
};
