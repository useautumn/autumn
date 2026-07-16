import {
	type FullCusProduct,
	findCustomerProductSuccessor,
} from "@autumn/shared";

export type CustomerProductPair = {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
};

export const pairCustomerProducts = ({
	outgoingCustomerProducts,
	incomingCustomerProducts,
}: {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
}): CustomerProductPair[] => {
	const claimedIncomingCustomerProductIds = new Set<string>();

	return outgoingCustomerProducts.flatMap((outgoingCustomerProduct) => {
		const incomingCustomerProduct = findCustomerProductSuccessor({
			sourceCustomerProduct: outgoingCustomerProduct,
			candidateCustomerProducts: incomingCustomerProducts,
			excludedCustomerProductIds: claimedIncomingCustomerProductIds,
		});
		if (!incomingCustomerProduct) return [];

		claimedIncomingCustomerProductIds.add(incomingCustomerProduct.id);
		return [{ outgoingCustomerProduct, incomingCustomerProduct }];
	});
};
