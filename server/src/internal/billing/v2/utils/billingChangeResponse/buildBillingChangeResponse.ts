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
	tags = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	autumnBillingPlan: AutumnBillingPlan;
	tags?: string[];
}): BillingChangeResponse => {
	// entity_id comes from the enriched FullCustomer (set when the operation
	// is scoped to a single entity via `enrichFullCustomerWithEntity`).
	const entityId = originalFullCustomer.entity?.id ?? undefined;

	return BillingChangeResponseSchema.parse({
		object: "billing.updated",
		customer_id: originalFullCustomer.id ?? originalFullCustomer.internal_id,
		...(entityId !== undefined ? { entity_id: entityId } : {}),
		plan_changes: buildPlanChanges({
			autumnBillingPlan,
			originalFullCustomer,
		}),
		tags,
	});
};
