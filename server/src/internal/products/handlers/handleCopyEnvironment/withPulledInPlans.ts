import type { FullProduct } from "@autumn/shared";

/**
 * Adds the given source plans to the copy set unless the set or the target
 * already has a plan with that id.
 */
export const withPulledInPlans = ({
	fromProducts,
	fromProductsAll,
	toProducts,
	planIds,
}: {
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
	toProducts: FullProduct[];
	planIds: string[];
}): FullProduct[] => {
	const includedIds = new Set(fromProducts.map((product) => product.id));
	const targetIds = new Set(toProducts.map((product) => product.id));

	const pulledIn: FullProduct[] = [];
	for (const planId of planIds) {
		if (includedIds.has(planId) || targetIds.has(planId)) continue;

		const plan = fromProductsAll.find((product) => product.id === planId);
		if (!plan) continue;

		pulledIn.push(plan);
		includedIds.add(planId);
	}

	return [...fromProducts, ...pulledIn];
};
