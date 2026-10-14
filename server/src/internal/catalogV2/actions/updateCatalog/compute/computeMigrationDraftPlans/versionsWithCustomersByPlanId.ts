import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

export const versionsWithCustomersByPlanId = ({
	productStatesContext,
}: {
	productStatesContext: ProductStatesContext;
}): Record<string, number[]> => {
	const result: Record<string, number[]> = {};
	for (const [planId, versions] of Object.entries(
		productStatesContext.versionsByPlanId,
	)) {
		result[planId] = versions
			.filter(
				(product) =>
					productKeyToState({
						productKey: productToProductKey({ product }),
						productStatesContext,
					}).customerUsage.hasVersionableDirectCustomerProducts,
			)
			.map((product) => product.version);
	}
	return result;
};
