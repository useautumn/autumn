import {
	type ApiPlan,
	ApiPlanSchema,
	type ApiProduct,
	isPriceItem,
	itemsToPlanFeatures,
	type ProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
/**
 * Convert Product V2 response format to Plan V2 format
 */
export const productV2ToPlan = ({
	product,
}: {
	product: ApiProduct;
}): ApiPlan => {
	const basePrice = productV2ToBasePrice({ product: product as ProductV2 });
	if (basePrice)
		product.items = product.items?.filter((item) => !isPriceItem(item)) ?? [];

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

		...(basePrice ? { price: basePrice } : {}),

		// Convert items to features
		features: itemsToPlanFeatures({ items: product.items ?? [] }),

		// Free trial - might need schema conversion
		...(product.free_trial
			? {
					free_trial: {
						duration_type: product.free_trial.duration,
						duration_length: product.free_trial.length,
						card_required: product.free_trial.card_required ?? false,
					},
				}
			: {}),

		// Misc fields
		created_at: product.created_at,
		env: product.env,
		archived: product.archived,
		base_variant_id: product.base_variant_id,
	});
};
