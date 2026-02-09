import type { ApiPlan } from "@api/products/apiPlan";
import type {
	CreatePlanParams,
	UpdatePlanParams,
} from "@api/products/crud/planOpModels";
import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";
import type {
	CreateProductV2Params,
	UpdateProductV2Params,
} from "@api/products/productOpModels";
import type { ProductV2 } from "@models/productV2Models/productV2Models";
import type { SharedContext } from "../../../types/sharedContext";

export function planV0ToProductV2({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: ApiPlan | CreatePlanParams | UpdatePlanParams;
}): CreateProductV2Params | UpdateProductV2Params | ProductV2 {
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
	};
}
