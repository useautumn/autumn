import type { FullCusProduct } from "@autumn/shared";

export const withSupersededUsage = ({
	customerProduct,
	supersededInstances = [],
}: {
	customerProduct: FullCusProduct;
	supersededInstances?: FullCusProduct[];
}): FullCusProduct =>
	supersededInstances.length === 0
		? customerProduct
		: {
				...customerProduct,
				customer_entitlements: [
					...customerProduct.customer_entitlements,
					...supersededInstances.flatMap(
						(instance) => instance.customer_entitlements,
					),
				],
			};
