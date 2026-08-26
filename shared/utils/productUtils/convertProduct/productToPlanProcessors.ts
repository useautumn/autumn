import type { ApiPlanProcessors } from "@api/products/components/processors";
import type { Product } from "@models/productModels/productModels";

export const productToPlanProcessors = ({
	product,
}: {
	product: Pick<Product, "processor">;
}): ApiPlanProcessors | undefined => {
	const processor = product.processor;
	if (!processor?.id) return undefined;
	return {
		stripe: {
			product_id: processor.id,
			...(processor.additional_ids?.length
				? { additional_product_ids: processor.additional_ids }
				: {}),
		},
	};
};
