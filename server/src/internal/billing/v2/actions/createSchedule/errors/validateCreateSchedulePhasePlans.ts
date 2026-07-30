import { type FullProduct, isOneOffProduct, RecaseError } from "@autumn/shared";

/** Reject conflicting main recurring plans within the same phase scope. */
export const validateCreateSchedulePhasePlans = ({
	plans,
}: {
	plans: { fullProduct: FullProduct; scopeId?: string }[];
}) => {
	const groupedProducts = new Map<string, FullProduct[]>();

	for (const { fullProduct, scopeId } of plans) {
		if (fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })) {
			continue;
		}

		const group = fullProduct.group ?? "";
		const key = JSON.stringify([scopeId ?? null, group]);
		const productsInGroup = groupedProducts.get(key) ?? [];
		productsInGroup.push(fullProduct);
		groupedProducts.set(key, productsInGroup);
	}

	const conflictingProducts = [...groupedProducts.values()].flatMap(
		(products) => (products.length > 1 ? products : []),
	);

	if (conflictingProducts.length === 0) return;

	const planIds = conflictingProducts
		.map((product) => `"${product.id}"`)
		.join(", ");

	throw new RecaseError({
		message: `Create schedule supports at most one plan per group and scope in each phase, but plans ${planIds} conflict.`,
		statusCode: 400,
	});
};
