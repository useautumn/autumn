import type {
	ApiPlanProcessors,
	ApiRevenueCatProduct,
} from "@api/products/components/processors";
import type { Product } from "@models/productModels/productModels";

/** The `revenuecat_mappings` row for this plan — a separate table, so it is read in. */
export type RevenueCatPlanMapping = {
	revenuecat_product_ids: string[];
	feature_quantities?: Record<
		string,
		Array<{ feature_id: string; quantity?: number }>
	> | null;
};

const revenuecatProducts = ({
	mapping,
}: {
	mapping: RevenueCatPlanMapping;
}): ApiRevenueCatProduct[] =>
	mapping.revenuecat_product_ids.map((productId) => {
		const quantities = mapping.feature_quantities?.[productId];
		return {
			product_id: productId,
			...(quantities?.length ? { feature_quantities: quantities } : {}),
		};
	});

export const productToPlanProcessors = ({
	product,
	revenuecatMapping,
}: {
	product: Pick<Product, "processor">;
	revenuecatMapping?: RevenueCatPlanMapping | null;
}): ApiPlanProcessors | undefined => {
	const processor = product.processor;
	const stripe = processor?.id
		? {
				product_id: processor.id,
				...(processor.additional_ids?.length
					? { additional_product_ids: processor.additional_ids }
					: {}),
			}
		: undefined;
	const revenuecat = revenuecatMapping?.revenuecat_product_ids?.length
		? { products: revenuecatProducts({ mapping: revenuecatMapping }) }
		: undefined;

	if (!stripe && !revenuecat) return undefined;
	return {
		...(stripe ? { stripe } : {}),
		...(revenuecat ? { revenuecat } : {}),
	};
};
