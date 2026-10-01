import type {
	BillingPlan,
	BillingResult,
	CreateScheduleBillingContext,
} from "@autumn/shared";
import type { SetPlansPlanResult } from "../compute/computeSetPlansPlan";
import type { persistSetPlansSchedule } from "../utils/persistSetPlansSchedule";
import type { SetPlansTimeline } from "./setPlansTimeline";

export type SetPlansResult = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	timeline: SetPlansTimeline;
	schedulePlan: Omit<SetPlansPlanResult, "autumnBillingPlan">;
	billingResult?: BillingResult;
	persistedSchedule?: Awaited<ReturnType<typeof persistSetPlansSchedule>>;
};
