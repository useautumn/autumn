import type {
	AutumnBillingPlan,
	CustomerPlanChange,
	Entity,
	FullCustomer,
} from "@autumn/shared";
import {
	buildCustomerPlanChange,
	type CustomerProductTransition,
} from "../buildCustomerPlanChanges/buildCustomerPlanChange";
import { mergeUpdatedPlanChanges } from "../buildCustomerPlanChanges/mergeUpdatedPlanChanges";
import { autumnBillingPlanToTransitions } from "./autumnBillingPlanToTransitions";

export const transitionsToCustomerPlanChanges = ({
	transitions,
	entities,
}: {
	transitions: CustomerProductTransition[];
	entities?: Entity[];
}): CustomerPlanChange[] =>
	mergeUpdatedPlanChanges(
		transitions
			.map((transition) => buildCustomerPlanChange({ ...transition, entities }))
			.filter((change): change is CustomerPlanChange => change !== undefined),
	);

/** Billing plan → per-product before/after transitions → kernel → dedupe. */
export const autumnBillingPlanToCustomerPlanChanges = ({
	autumnBillingPlan,
	originalFullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer?: FullCustomer;
}): CustomerPlanChange[] => {
	return transitionsToCustomerPlanChanges({
		transitions: autumnBillingPlanToTransitions({
			autumnBillingPlan,
			originalFullCustomer,
		}),
		entities: originalFullCustomer?.entities,
	});
};
