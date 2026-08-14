import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Latest version of a license child in the projected catalog, or null if missing. */
export const resolveLicenseProduct = ({
	licensePlanId,
	productStatesContext,
}: {
	licensePlanId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	productStatesContext.versionsByPlanId[licensePlanId]?.[0] ?? null;
