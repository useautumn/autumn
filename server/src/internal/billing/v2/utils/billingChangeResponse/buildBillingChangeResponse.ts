import {
	type AutumnBillingPlan,
	type BillingChangeResponse,
	BillingChangeResponseSchema,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildPlanChanges } from "./buildPlanChanges";

export const buildBillingChangeResponse = ({
	ctx: _ctx,
	originalFullCustomer,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
}): BillingChangeResponse => {
	return BillingChangeResponseSchema.parse({
		object: "billing.plans_changed",
		customer_id:
			originalFullCustomer.id ?? originalFullCustomer.internal_id,
		plan_changes: buildPlanChanges({ autumnBillingPlan }),
	});
};
