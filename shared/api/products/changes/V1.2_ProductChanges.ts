import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems.js";
import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { PriceItem } from "@models/productV2Models/productItemModels/priceItem.js";
import { isPriceItem } from "@utils/index.js";
import type { SharedContext } from "../../../types/sharedContext.js";
import { productV2ToProperties } from "../../../utils/productV2Utils/productV2ToProperties.js";
import { PlanLegacyDataSchema } from "../planLegacyData.js";
import {
	type ApiPlan,
	ApiPlanV0Schema,
} from "../previousVersions/apiPlanV0.js";
import {
	type ApiProduct,
	ApiProductSchema,
} from "../previousVersions/apiProduct.js";

export const V1_2_ProductChanges = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Product format changed from Plan to ProductV2 schema",
		"Features array renamed to items with different structure",
		"Base price moved from root level to items array",
		"Boolean fields renamed (add_on <- is_add_on, default <- is_default)",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanV0Schema,
	oldSchema: ApiProductSchema,
	legacyDataSchema: PlanLegacyDataSchema,

	affectsRequest: false,
	affectsResponse: true,

	transformResponse: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: ApiPlan;
	}): ApiProduct => {
		const productItems = planV0ToProductItems({
			ctx,
			plan: input,
		}).filter((x) => {
			if (isPriceItem(x)) {
				const y: PriceItem = x as unknown as PriceItem;
				return y.price > 0;
			} else {
				return true;
			}
		});

		const productV2 = {
			id: input.id,
			name: input.name,
			group: input.group,
			env: input.env,
			is_add_on: input.add_on,
			is_default: input.default,
			archived: input.archived,
			version: input.version,
			created_at: input.created_at,
			items: productItems,
			free_trial: input.free_trial
				? {
						duration: input.free_trial.duration_type,
						length: input.free_trial.duration_length,
						card_required: input.free_trial.card_required,
						unique_fingerprint: true,
						trial_available:
							input.customer_eligibility?.trial_available ?? null,
					}
				: null,
			base_variant_id: input.base_variant_id,
			scenario: input.customer_eligibility?.scenario ?? undefined,
		} satisfies ApiProduct;

		const properties = productV2ToProperties({
			productV2: productV2,
			trialAvailable: true,
		});

		return {
			...productV2,
			properties: properties,
		};
	},
});
