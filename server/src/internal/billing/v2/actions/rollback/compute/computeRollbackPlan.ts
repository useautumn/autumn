import type { AutumnBillingPlan } from "@autumn/shared";
import { handleRollbackPlanErrors } from "../errors/handleRollbackPlanErrors";
import { computeRollbackOperations } from "./computeRollbackOperations";

export const computeRollbackPlan = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): AutumnBillingPlan => {
	handleRollbackPlanErrors({ autumnBillingPlan });

	return {
		customerId: autumnBillingPlan.customerId,
		...computeRollbackOperations({ autumnBillingPlan }),
	};
};
