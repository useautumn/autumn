import type { FullCusProduct } from "@autumn/shared";

export const differenceByCustomerProductId = ({
	left,
	right,
}: {
	left: FullCusProduct[];
	right: FullCusProduct[];
}) => {
	const rightIds = new Set(right.map((customerProduct) => customerProduct.id));
	return left.filter((customerProduct) => !rightIds.has(customerProduct.id));
};

export const uniqueCustomerProductsById = (
	customerProducts: FullCusProduct[],
) => {
	const seen = new Set<string>();
	return customerProducts.filter((customerProduct) => {
		if (seen.has(customerProduct.id)) return false;
		seen.add(customerProduct.id);
		return true;
	});
};

/** Treats same-group future products as replacing the active product. */
export const getImplicitOutgoingCustomerProducts = ({
	incomingCustomerProducts,
	previousCustomerProducts,
}: {
	incomingCustomerProducts: FullCusProduct[];
	previousCustomerProducts: FullCusProduct[];
}) =>
	previousCustomerProducts.filter((previousCustomerProduct) =>
		incomingCustomerProducts.some((incomingCustomerProduct) => {
			const productGroup = incomingCustomerProduct.product.group;
			if (!productGroup) return false;

			return (
				previousCustomerProduct.product.group === productGroup &&
				previousCustomerProduct.product.is_add_on ===
					incomingCustomerProduct.product.is_add_on &&
				previousCustomerProduct.internal_entity_id ===
					incomingCustomerProduct.internal_entity_id
			);
		}),
	);
