import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import { convertPlanToItems } from "@utils/planFeatureUtils/planToItems.js";
import { type ApiPlan, ApiPlanSchema } from "../apiPlan.js";
import {
	type ApiProduct,
	ApiProductSchema,
} from "../previousVersions/apiProduct.js";

/**
 * V1_2_ProductChanges: Transforms product response TO V1.2 format
 *
 * Applied when: targetVersion <= V1.2
 *
 * Breaking changes introduced in V2 (that we reverse here):
 *
 * 1. Schema change: Plan � ProductV2
 *    - V2: Plan format with `features` array, root-level `price`
 *    - V1.2: ProductV2 format with `items` array
 *
 * 2. Field renames:
 *    - V2: `add_on`, `default`
 *    - V1.2: `is_add_on`, `is_default`
 *
 * 3. Structure changes:
 *    - V2: Base price at root level as `price` object
 *    - V1.2: Price embedded in items array
 *
 * 4. Feature representation:
 *    - V2: `features` with Plan-specific fields
 *    - V1.2: `items` with Product-specific fields
 *
 * Input: ApiPlan (V2 Plan format)
 * Output: ApiProduct (V1.2 ProductV2 format)
 */

export const V1_2_ProductChanges = defineVersionChange({
	newVersion: ApiVersion.V2, // Breaking change introduced in V2
	oldVersion: ApiVersion.V1_2, // Applied when targetVersion <= V1.2
	description: [
		"Product format changed from Plan to ProductV2 schema",
		"Features array renamed to items with different structure",
		"Base price moved from root level to items array",
		"Boolean fields renamed (add_on <- is_add_on, default <- is_default)",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanSchema,
	oldSchema: ApiProductSchema,

	// Only transform responses (handler outputs Plan format)
	affectsRequest: false,
	affectsResponse: true,

	// Response: V2 Plan <- V1.2 ProductV2
	transformResponse: ({ input }: { input: ApiPlan }): ApiProduct => {
		// Transform Plan format to ProductV2 format for V1.2 clients

		// Extract base price from Plan
		const basePrice = input.price || {
			amount: 0,
			interval: "month" as BillingInterval,
		};

		// Convert plan to items using shared utility
		const items = convertPlanToItems({ plan: input });

		return ApiProductSchema.parse({
			id: input.id,
			name: input.name,
			group: input.group,
			env: input.env,
			is_add_on: input.add_on,
			is_default: input.default,
			archived: input.archived,
			version: input.version,
			created_at: input.created_at,
			items: items,
			free_trial: input.free_trial
				? {
						duration: input.free_trial.duration_type,
						length: input.free_trial.duration_length,
						card_required: input.free_trial.card_required,
						unique_fingerprint: true,
					}
				: null,
			base_variant_id: input.base_variant_id,
			// Properties are computed, not stored in Plan
			properties: {
				is_free: basePrice.amount === 0,
				is_one_off: false,
				interval_group: basePrice.interval,
				has_trial: input.free_trial !== null && input.free_trial !== undefined,
				updateable: true,
			},
		});
	},
});
