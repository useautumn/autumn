import type { ProductV2 } from "@autumn/shared";

export const resolvePlanLicenseProduct = ({
	products,
	planId,
	version,
}: {
	products: ProductV2[];
	planId: string;
	version: number;
}) =>
	products.find(
		(product) => product.id === planId && product.version === version,
	);

/** Exact-version match with latest-version fallback for unpinned rows. */
export const resolveLicenseProductWithFallback = ({
	products,
	planId,
	version,
}: {
	products: ProductV2[];
	planId: string;
	version?: number;
}): ProductV2 | undefined => {
	if (version !== undefined) {
		const exact = resolvePlanLicenseProduct({ products, planId, version });
		if (exact) return exact;
	}
	let latest: ProductV2 | undefined;
	for (const product of products) {
		if (product.id !== planId) continue;
		if (!latest || product.version > latest.version) latest = product;
	}
	return latest;
};
