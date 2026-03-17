import type { Plan } from "../../../compose/models/planModels.js";
import type { ApiPlan } from "../../api/types/index.js";
import { transformApiPlanItem } from "./planItem.js";
import { createTransformer } from "./Transformer.js";

/**
 * Declarative plan transformer - replaces 57 lines with ~20 lines of config
 */
export const planTransformer = createTransformer<ApiPlan, Plan>({
	copy: ["id", "name", "description", "group"],

	// Rename snake_case API fields → camelCase SDK fields
	rename: {
		add_on: "addOn",
		auto_enable: "autoEnable",
	},

	// Swap null to undefined for these fields (API → SDK direction)
	// When pulling from API: null becomes undefined (cleaner, won't show in generated code)
	swapNullish: ["group"],

	// Swap false to undefined for these fields (API → SDK direction)
	// When pulling from API: false becomes undefined (only true or undefined in SDK for booleans)
	swapFalse: ["auto_enable", "add_on"],

	// Copy nested price object as-is
	compute: {
		price: (api) =>
			api.price
				? {
						amount: api.price.amount,
						interval: api.price.interval,
					}
				: undefined,

		// Transform items array (only if non-empty)
		items: (api) =>
			api.items && api.items.length > 0
				? api.items.map(transformApiPlanItem)
				: undefined,

		// Map snake_case inner fields to camelCase
		freeTrial: (api) =>
			api.free_trial
				? {
						durationLength: api.free_trial.duration_length,
						durationType: api.free_trial.duration_type,
						cardRequired: api.free_trial.card_required,
					}
				: undefined,
	},
});

export function transformApiPlan(apiPlan: ApiPlan): Plan {
	return planTransformer.transform(apiPlan);
}
