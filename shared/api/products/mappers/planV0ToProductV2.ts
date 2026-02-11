import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import type { SharedContext } from "../../../types/sharedContext";

export function planV0ToProductV2({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: ApiPlan;
}): ProductV2 {
	// Convert plan to items using shared utility
	const items = planV0ToProductItems({ ctx, plan });

	// Check if archived field exists on plan (it's on ApiPlan, not CreatePlanParams)
	const archived =
		"archived" in plan && plan.archived !== undefined
			? plan.archived
			: undefined;

	return {
		id: plan.id,
		name: plan.name,
		description: plan.description ?? null,
		is_add_on: plan.add_on,
		is_default: plan.default,
		group: plan.group ?? "",
		items,
		free_trial: plan.free_trial
			? {
					duration: plan.free_trial.duration_type,
					length: plan.free_trial.duration_length,
					unique_fingerprint: false,
					card_required: plan.free_trial.card_required,
				}
			: null,
		...(archived !== undefined && { archived }),

		version: plan.version,
		env: plan.env,
		created_at: plan.created_at,
	};
}
