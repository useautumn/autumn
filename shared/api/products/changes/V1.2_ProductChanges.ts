import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { PriceItem } from "@models/productV2Models/productItemModels/priceItem.js";
import { isPriceItem } from "@utils/index.js";
import { convertPlanToItems } from "@utils/planFeatureUtils/planToItems.js";
import { type ApiPlan, ApiPlanSchema } from "../apiPlan.js";
import {
	type PlanLegacyData,
	PlanLegacyDataSchema,
} from "../planLegacyData.js";
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
	newVersion: ApiVersion.V2_0, // Breaking change introduced in V2
	oldVersion: ApiVersion.V1_Beta, // Applied when targetVersion <= V1.2
	description: [
		"Product format changed from Plan to ProductV2 schema",
		"Features array renamed to items with different structure",
		"Base price moved from root level to items array",
		"Boolean fields renamed (add_on <- is_add_on, default <- is_default)",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanSchema,
	oldSchema: ApiProductSchema,
	legacyDataSchema: PlanLegacyDataSchema,

	// Only transform responses (requests handled manually in handler)
	affectsRequest: false,
	affectsResponse: true,

	// Response: V2 Plan -> V1.2 ProductV2
	transformResponse: ({
		input,
		legacyData,
	}: {
		input: ApiPlan;
		legacyData?: PlanLegacyData;
	}): ApiProduct => {
		// Convert plan to items using shared utility (handles base price + features)
		const items = convertPlanToItems({
			plan: input,
			features: legacyData?.features || [],
		}).filter((x) => {
			if (isPriceItem(x)) {
				const y: PriceItem = x as unknown as PriceItem;
				return y.price > 0;
			} else {
				return true;
			}
		});

		return ApiProductSchema.parse({
			id: input.id,
			name: input.name,
			group: input.group,
			description: input.description,
			env: input.env,
			is_add_on: input.add_on,
			is_default: input.default,
			archived: input.archived,
			version: input.version,
			created_at: input.created_at,
			items: items, // Already includes base price and features
			free_trial: input.free_trial
				? {
						duration: input.free_trial.duration_type,
						length: input.free_trial.duration_length,
						card_required: input.free_trial.card_required,
						unique_fingerprint: true,
					}
				: null,
			base_variant_id: input.base_variant_id,
		});
	},
});
