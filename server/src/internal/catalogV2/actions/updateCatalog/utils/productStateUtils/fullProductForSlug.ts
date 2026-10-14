import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

export const fullProductForSlug = ({
	planId,
	versionSlug,
	productStatesContext,
}: {
	planId: string;
	versionSlug: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	(productStatesContext.versionsByPlanId[planId] ?? []).find(
		(product) => product.version_slug === versionSlug,
	) ?? null;
