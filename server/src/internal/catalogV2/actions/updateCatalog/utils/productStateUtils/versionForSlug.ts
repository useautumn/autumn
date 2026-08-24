import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Version number for this plan_id + version_slug, or undefined if no row owns it. */
export const versionForSlug = ({
	planId,
	versionSlug,
	productStatesContext,
}: {
	planId: string;
	versionSlug: string;
	productStatesContext: ProductStatesContext;
}): number | undefined =>
	(productStatesContext.versionsByPlanId[planId] ?? []).find(
		(product) => product.version_slug === versionSlug,
	)?.version;
