import { type FullProduct, isOneOffProduct, RecaseError } from "@autumn/shared";

/** Reject conflicting main recurring plans within a single create_schedule phase. */
export const validateCreateSchedulePhasePlans = ({
	fullProducts,
}: {
	fullProducts: FullProduct[];
}) => {
	const groupedProducts = new Map<string, FullProduct[]>();

	for (const fullProduct of fullProducts) {
		if (
			fullProduct.is_add_on ||
			isOneOffProduct({ prices: fullProduct.prices })
		) {
			continue;
		}

		const group = fullProduct.group ?? "";
		const productsInGroup = groupedProducts.get(group) ?? [];
		productsInGroup.push(fullProduct);
		groupedProducts.set(group, productsInGroup);
	}

	const conflictingProducts = [...groupedProducts.values()].flatMap(
		(products) => (products.length > 1 ? products : []),
	);

	if (conflictingProducts.length === 0) return;

	const planIds = conflictingProducts
		.map((product) => `"${product.id}"`)
		.join(", ");

	throw new RecaseError({
		message: `Create schedule supports at most one plan per group in each phase, but plans ${planIds} conflict with another requested plan in their group.`,
		statusCode: 400,
	});
};
