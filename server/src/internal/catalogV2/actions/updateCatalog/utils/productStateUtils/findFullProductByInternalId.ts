import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Row lookup across every plan's versions — includes rows created earlier in the fold. */
export const findFullProductByInternalId = ({
	internalId,
	productStatesContext,
}: {
	internalId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	for (const versions of Object.values(productStatesContext.versionsByPlanId)) {
		const match = versions.find(
			(product) => product.internal_id === internalId,
		);
		if (match) return match;
	}
	return null;
};
