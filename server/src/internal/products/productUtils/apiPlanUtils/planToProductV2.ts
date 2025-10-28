import {
	type CreatePlanParams,
	type CreateProductV2Params,
	CreateProductV2ParamsSchema,
	convertPlanToItems,
} from "@autumn/shared";
import type { ApiPlan } from "@shared/api/products/apiPlan.js";

export const planToProductV2 = ({
	plan,
}: {
	plan: ApiPlan | CreatePlanParams;
}): CreateProductV2Params => {
	try {
		// Convert plan to items using shared utility
		const items = convertPlanToItems({ plan });

		return CreateProductV2ParamsSchema.parse({
			id: plan.id,
			name: plan.name,
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
		} satisfies CreateProductV2Params);
	} catch (error) {
		console.error("Error converting plan to product V2:", error);
		throw error;
	}
};
