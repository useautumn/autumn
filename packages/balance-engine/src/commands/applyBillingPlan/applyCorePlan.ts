import type { SubjectState } from "../../models/subject/subjectState.js";
import { applyMutation } from "../../mutation/applyMutation.js";
import { opToRowChanges } from "./opToRowChanges/opToRowChanges.js";
import { createPlanRowChangeContext } from "./opToRowChanges/planRowChangeContext.js";
import { expiringPooledBalancesToRowChanges } from "./opToRowChanges/pooled/expiringPooledBalancesToRowChanges.js";
import { toPlanMutation } from "./toPlanMutation.js";
import type { AppliedPlanStep } from "./types/appliedPlanStep.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";

/** The core plan: every op but a rebalance, against the rows as found before the plan, then the pools it leaves empty. */
export const applyCorePlan = ({
	command,
	state,
}: {
	command: ApplyBillingPlanCommand;
	state: SubjectState | null;
}): AppliedPlanStep => {
	const context = createPlanRowChangeContext({ state });
	const changes = [
		...command.ops.flatMap((op) =>
			op.op === "rebalance" ? [] : opToRowChanges({ op, context }),
		),
		...expiringPooledBalancesToRowChanges({ command, context }),
	];
	return {
		changes,
		state: applyMutation({
			state,
			mutation: toPlanMutation({ command, state, changes }),
		}),
	};
};
