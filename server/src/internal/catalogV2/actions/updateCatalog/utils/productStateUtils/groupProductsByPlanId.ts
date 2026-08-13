import type { FullProduct } from "@autumn/shared";

/** Group product rows by plan_id, newest version first. */
export const groupProductsByPlanId = ({
	products,
}: {
	products: FullProduct[];
}): Map<string, FullProduct[]> => {
	const versionsByPlanId = new Map<string, FullProduct[]>();
	for (const product of products) {
		const versions = versionsByPlanId.get(product.id) ?? [];
		versions.push(product);
		versionsByPlanId.set(product.id, versions);
	}
	for (const versions of versionsByPlanId.values()) {
		versions.sort((a, b) => b.version - a.version);
	}
	return versionsByPlanId;
};
