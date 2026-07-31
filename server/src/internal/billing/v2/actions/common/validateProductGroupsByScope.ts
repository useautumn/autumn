import { type FullProduct, isOneOffProduct, RecaseError } from "@autumn/shared";

/** Reject conflicting main recurring plans within one group and scope. */
export const validateProductGroupsByScope = ({
	plans,
	operation,
}: {
	plans: { fullProduct: FullProduct; scopeId?: string }[];
	operation: string;
}) => {
	const groupedProducts = new Map<string, FullProduct[]>();

	for (const { fullProduct, scopeId } of plans) {
		if (fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })) {
			continue;
		}

		const key = JSON.stringify([scopeId ?? null, fullProduct.group ?? ""]);
		const products = groupedProducts.get(key) ?? [];
		products.push(fullProduct);
		groupedProducts.set(key, products);
	}

	const conflictingProducts = [...groupedProducts.values()].flatMap(
		(products) => (products.length > 1 ? products : []),
	);
	if (conflictingProducts.length === 0) return;

	const planIds = conflictingProducts
		.map((product) => `"${product.id}"`)
		.join(", ");
	throw new RecaseError({
		message: `${operation} supports at most one plan per group and scope, but plans ${planIds} conflict.`,
		statusCode: 400,
	});
};
