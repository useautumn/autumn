import type { ApiPlan } from "@api/products/apiPlan.js";
import type {
	CreateProductV2Params,
	UpdateProductV2Params,
} from "@api/products/productOpModels.js";
import { convertPlanToItems } from "./planToItems.js";

/**
 * Convert Plan format to ProductV2 format
 *
 * This function converts the newer Plan API format to the internal ProductV2 format
 * used by handlers. Works for both CREATE and UPDATE operations.
 *
 * @param plan - ApiPlan (validated at API boundary)
 * @returns CreateProductV2Params | UpdateProductV2Params
 */
export function planToProductV2({
	plan,
}: {
	plan: ApiPlan;
}): CreateProductV2Params | UpdateProductV2Params {
	// Convert plan to items using shared utility
	const items = convertPlanToItems({ plan });

	return {
		id: plan.id,
		name: plan.name,
		is_add_on: plan.add_on,
		is_default: plan.default,
		version: plan.version,
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
	};
}
