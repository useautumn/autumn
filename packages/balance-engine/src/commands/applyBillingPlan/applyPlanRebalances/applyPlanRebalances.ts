import { rebalance } from "../../../common/rebalance/rebalance.js";
import { UnsupportedCommandError } from "../../../errors.js";
import type { Catalog } from "../../../models/catalog/catalog.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerEntity } from "../../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import { applyChanges } from "../../../mutation/applyChanges.js";
import type { AppliedPlanStep } from "../types/appliedPlanStep.js";
import type { ApplyBillingPlanCommand } from "../types/applyBillingPlanCommand.js";
import type {
	BillingPlanOp,
	BillingPlanRebalanceOp,
} from "../types/billingPlanOp.js";
import { purchasedRowToFullSubject } from "./purchasedRowToFullSubject.js";

const isRebalanceOp = (op: BillingPlanOp): op is BillingPlanRebalanceOp =>
	op.op === "rebalance";

/** Each purchase sized against the rows as they stand after the plan's rows and the purchases before it. */
export const applyPlanRebalances = ({
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
	const rebalanceOps = command.ops.filter(isRebalanceOp);
	if (rebalanceOps.length === 0) return { changes: [], state };
	if (!catalog)
		throw new UnsupportedCommandError({
			reason: "billing_plan_rebalance_needs_catalog",
		});

	let appliedState = state;
	const changes: RowChange[] = [];
	for (const op of rebalanceOps) {
		const fullSubject = purchasedRowToFullSubject({
			op,
			state: appliedState,
			entities,
			catalog,
		});
		const { changes: rebalanceChanges } = rebalance({
			fullSubject,
			request: {
				featureId: op.featureId,
				customerEntitlementId: op.id,
				quantity: op.quantity,
				creditedCustomerEntitlementId: op.creditedId,
				now: command.occurredAt,
			},
		});
		appliedState = applyChanges({
			state: appliedState,
			changes: rebalanceChanges,
		});
		changes.push(...rebalanceChanges);
	}
	return { changes, state: appliedState };
};
