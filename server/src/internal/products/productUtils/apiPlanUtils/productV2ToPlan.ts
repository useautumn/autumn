import {
	type ApiPlan,
	ApiPlanSchema,
	type ApiProduct,
} from "@autumn/shared";
import { itemsToPlanFeatures } from "./planFeatureUtils/itemsToPlanFeatures.js";

/**
 * Convert Product V2 response format to Plan V2 format
 */
export const productV2ToPlan = ({
	product,
}: {
	product: ApiProduct;
}): ApiPlan => {
	return ApiPlanSchema.parse({
		// Basic fields
		id: product.id,
		name: product.name,
		description: null, // Product doesn't have description field
		group: product.group,
		version: product.version,

		// Boolean flags with renamed fields
		add_on: product.is_add_on,
		default: product.is_default,

		// Price - need to extract from items or set default
		// This might need adjustment based on how price is determined
		price: {
			amount: 0, // You may need to calculate this from items
			interval: "month", // Default, adjust as needed
		},

		// Convert items to features
		features: product.items ? itemsToPlanFeatures({ items: product.items }) : [],

		// Free trial - might need schema conversion
		free_trial: product.free_trial
			? {
					duration_type: product.free_trial.duration,
					duration_length: product.free_trial.length,
					card_required: product.free_trial.card_required ?? false,
				}
			: null,

		// Misc fields
		created_at: product.created_at,
		env: product.env,
		archived: product.archived,
		base_variant_id: product.base_variant_id,
	});
};