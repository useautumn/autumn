import {
	type AutumnBillingPlan,
	type BillingChangeResponse,
	BillingChangeResponseSchema,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingChanges } from "./buildBillingChanges";
import { planChangesToEntityId } from "./planChangesToEntityId";

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
	const { planChanges } = buildBillingChanges({
		autumnBillingPlan,
		originalFullCustomer,
	});

	// Prefer the request's entity scope; webhook-driven flows have none, so fall
	// back to the changes themselves when they all share one entity.
	const entityId =
		originalFullCustomer.entity?.id ?? planChangesToEntityId({ planChanges });

	return BillingChangeResponseSchema.parse({
		object: "billing.updated",
		customer_id: originalFullCustomer.id ?? originalFullCustomer.internal_id,
		...(entityId !== undefined ? { entity_id: entityId } : {}),
		plan_changes: planChanges,
		tags,
	});
};
