import type { FullCusProduct } from "@autumn/shared";

export const outgoingInstancesToCarrySource = ({
	customerProduct,
	extraOutgoingInstances = [],
}: {
	customerProduct: FullCusProduct;
	extraOutgoingInstances?: FullCusProduct[];
}): FullCusProduct =>
	extraOutgoingInstances.length === 0
		? customerProduct
		: {
				...customerProduct,
				customer_entitlements: [
					...customerProduct.customer_entitlements,
					...extraOutgoingInstances.flatMap(
						(instance) => instance.customer_entitlements,
					),
				],
			};
