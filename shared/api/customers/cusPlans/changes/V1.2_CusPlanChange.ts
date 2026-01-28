import type { ApiProductItem } from "@api/models.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
	type VersionContext,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { CusProductStatus } from "@models/cusProductModels/cusProductEnums.js";
import { convertPlanToItems } from "@utils/planFeatureUtils/planToItems.js";
import { getProductItemResponse } from "@utils/productV2Utils/productItemUtils/getProductItemRes.js";
import type { z } from "zod/v4";
import {
	type ApiSubscription,
	ApiSubscriptionSchema,
} from "../apiSubscription.js";
import { CusProductLegacyDataSchema } from "../cusProductLegacyData.js";
import { ApiCusProductV3Schema } from "../previousVersions/apiCusProductV3.js";

/**
 * Transform plan from V2.0 format to V1.2 product format
 * Exported so it can be reused in other transformations (e.g., V1_2_CustomerChange)
 */
export function transformSubscriptionToCusProductV3({
	input,
	legacyData,
	ctx,
}: {
	input: z.infer<typeof ApiSubscriptionSchema>;
	legacyData?: z.infer<typeof CusProductLegacyDataSchema>;
	ctx: VersionContext;
}): z.infer<typeof ApiCusProductV3Schema> {
	const cusPlanToCusProductV3Status = (plan: ApiSubscription) => {
		if (plan.status === CusProductStatus.Active) {
			if (plan.past_due) {
				return "past_due";
			}

			// trialing
			else if (plan.trial_ends_at && plan.trial_ends_at > Date.now()) {
				return "trialing";
			}
			return "active";
		}
		return plan.status;
	};

	let items: ApiProductItem[] | null = null;

	// Get features

	// console.log("Features:", ctx.features);
	if (input.plan && ctx.features) {
		const productItems = convertPlanToItems({
			plan: input.plan,
			features: ctx.features,
		});

		const itemResponses = productItems.map((item) =>
			getProductItemResponse({
				item,
				features: ctx.features,
				options: legacyData?.options,
			}),
		);

		items = itemResponses;
	}

	return {
		id: input.plan_id,

		// Plan properties...
		name: input.plan?.name ?? null,
		group: input.plan?.group ?? null,
		is_default: input.plan?.default ?? false,
		is_add_on: input.add_on,
		version: input.plan?.version ?? undefined,
		items: items, // Map from plan to product v2 items...

		status: cusPlanToCusProductV3Status(input),

		canceled_at: input.canceled_at ?? null,
		started_at: input.started_at,
		current_period_start: input.current_period_start,
		current_period_end: input.current_period_end,

		// entity_id: null,

		quantity: input.quantity,
	} satisfies z.infer<typeof ApiCusProductV3Schema>;
}

/**
 * V1_2_CusPlanChange: Transforms customer plan response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Renamed "products" to "plans" in SDK
 * 2. Simplified status enum to only "active"
 * 3. Added trial_ends_at field
 * 4. Optional product object for expanded plan data
 *
 * Input: ApiCusPlan (V2.0+ format with "product" field)
 * Output: ApiCusProductV3 (V1.2 format with verbose fields)
 */
const V1_2_CusPlanChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Renamed products to plans",
		"Simplified status enum",
		"Added trial_ends_at field",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiSubscriptionSchema,
	oldSchema: ApiCusProductV3Schema,

	legacyDataSchema: CusProductLegacyDataSchema,

	transformResponse: transformSubscriptionToCusProductV3,
});
