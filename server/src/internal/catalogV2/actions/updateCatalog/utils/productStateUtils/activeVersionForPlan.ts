import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "./activeFullProductForPlan";

export const activeVersionForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): number | undefined =>
	activeFullProductForPlan({ planId, productStatesContext })?.version;
