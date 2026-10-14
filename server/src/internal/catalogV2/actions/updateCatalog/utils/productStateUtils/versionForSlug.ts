import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForSlug } from "./fullProductForSlug";

export const versionForSlug = ({
	planId,
	versionSlug,
	productStatesContext,
}: {
	planId: string;
	versionSlug: string;
	productStatesContext: ProductStatesContext;
}): number | undefined =>
	fullProductForSlug({ planId, versionSlug, productStatesContext })?.version;
