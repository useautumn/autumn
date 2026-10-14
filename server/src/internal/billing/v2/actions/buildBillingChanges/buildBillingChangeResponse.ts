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
