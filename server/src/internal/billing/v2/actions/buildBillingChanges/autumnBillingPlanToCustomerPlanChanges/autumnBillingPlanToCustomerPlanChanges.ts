import type {
	AutumnBillingPlan,
	CustomerPlanChange,
	FullCustomer,
} from "@autumn/shared";
import { buildCustomerPlanChange } from "../buildCustomerPlanChanges/buildCustomerPlanChange";
import { mergeUpdatedPlanChanges } from "../buildCustomerPlanChanges/mergeUpdatedPlanChanges";
import { autumnBillingPlanToTransitions } from "./autumnBillingPlanToTransitions";

/** Billing plan → per-product before/after transitions → kernel → dedupe. */
export const autumnBillingPlanToCustomerPlanChanges = ({
	autumnBillingPlan,
	originalFullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer?: FullCustomer;
}): CustomerPlanChange[] => {
	const transitions = autumnBillingPlanToTransitions({
		autumnBillingPlan,
		originalFullCustomer,
	});

	const changes = transitions
		.map((transition) => buildCustomerPlanChange(transition))
		.filter((change): change is CustomerPlanChange => change !== undefined);

	return mergeUpdatedPlanChanges(changes);
};
