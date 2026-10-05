import { UnsupportedCommandError } from "../../../errors.js";
import type { Catalog } from "../../../models/catalog/catalog.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerEntity } from "../../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import { applyChanges } from "../../../mutation/applyChanges.js";
import { addRolloversWithinMax } from "../../common/addRolloversWithinMax.js";
import type { AppliedPlanStep } from "../types/appliedPlanStep.js";
import type { ApplyBillingPlanCommand } from "../types/applyBillingPlanCommand.js";
import type {
	BillingPlanAddRolloversOp,
	BillingPlanOp,
} from "../types/billingPlanOp.js";
import { heldRowToJoinedRow } from "./heldRowToJoinedRow.js";

const isAddRolloversOp = (op: BillingPlanOp): op is BillingPlanAddRolloversOp =>
	op.op === "addRollovers";

/** Each grant's new rollovers capped against the ones it holds, as the plan's rows and the ops before it leave them: the same cap a reset applies. */
export const applyPlanRollovers = ({
	command,
	state,
	entities,
	catalog,
}: {
	command: ApplyBillingPlanCommand;
	state: SubjectState;
	entities: readonly WorkerEntity[];
	catalog?: Catalog;
}): AppliedPlanStep => {
	const addRolloversOps = command.ops.filter(isAddRolloversOp);
	if (addRolloversOps.length === 0) return { changes: [], state };
	if (!catalog)
		throw new UnsupportedCommandError({
			reason: "billing_plan_rollovers_need_catalog",
		});

	let appliedState = state;
	const changes: RowChange[] = [];
	for (const op of addRolloversOps) {
		const rolloverChanges = addRolloversWithinMax({
			row: heldRowToJoinedRow({
				id: op.id,
				state: appliedState,
				entities,
				catalog,
			}),
			newRollovers: op.rows,
		});
		appliedState = applyChanges({
			state: appliedState,
			changes: rolloverChanges,
		});
		changes.push(...rolloverChanges);
	}
	return { changes, state: appliedState };
};
