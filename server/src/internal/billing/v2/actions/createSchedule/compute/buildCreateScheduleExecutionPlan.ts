import type { AutumnBillingPlan } from "@autumn/shared";
import type { MaterializedScheduledPhase } from "../utils/materializeScheduledPhases";

/** Merge immediate billing changes with future scheduled rows for Autumn execution. */
export const buildCreateScheduleExecutionPlan = ({
	immediateAutumnBillingPlan,
	futureScheduledPhases,
}: {
	immediateAutumnBillingPlan: AutumnBillingPlan;
	futureScheduledPhases: MaterializedScheduledPhase[];
}): AutumnBillingPlan => ({
	...immediateAutumnBillingPlan,
	insertCustomerProducts: [
		...immediateAutumnBillingPlan.insertCustomerProducts,
		...futureScheduledPhases.flatMap((phase) => phase.customerProducts),
	],
	customPrices: [
		...(immediateAutumnBillingPlan.customPrices ?? []),
		...futureScheduledPhases.flatMap((phase) => phase.customPrices),
	],
	customEntitlements: [
		...(immediateAutumnBillingPlan.customEntitlements ?? []),
		...futureScheduledPhases.flatMap((phase) => phase.customEntitlements),
	],
});
