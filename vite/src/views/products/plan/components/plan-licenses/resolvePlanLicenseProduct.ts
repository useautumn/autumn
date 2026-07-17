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
