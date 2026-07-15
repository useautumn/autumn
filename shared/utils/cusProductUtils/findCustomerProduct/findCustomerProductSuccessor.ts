import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import { cp } from "../classifyCustomerProduct/cpBuilder.js";

/** Finds the incoming main recurring product in the source's group and entity scope. */
export const findCustomerProductSuccessor = ({
	sourceCustomerProduct,
	candidateCustomerProducts,
	excludedCustomerProductIds,
}: {
	sourceCustomerProduct: FullCusProduct;
	candidateCustomerProducts: FullCusProduct[];
	excludedCustomerProductIds?: Set<string>;
}): FullCusProduct | undefined => {
	if (!cp(sourceCustomerProduct).recurring().main().valid) return undefined;

	return candidateCustomerProducts.find((candidateCustomerProduct) => {
		if (excludedCustomerProductIds?.has(candidateCustomerProduct.id)) {
			return false;
		}

		return cp(candidateCustomerProduct)
			.recurring()
			.main()
			.hasProductGroup({
				productGroup: sourceCustomerProduct.product.group,
			})
			.onEntity({
				internalEntityId: sourceCustomerProduct.internal_entity_id ?? undefined,
			}).valid;
	});
};
