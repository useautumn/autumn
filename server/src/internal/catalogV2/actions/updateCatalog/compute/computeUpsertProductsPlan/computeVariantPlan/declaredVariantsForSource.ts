import type {
	CatalogVariantParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const declaredVariantsForSource = ({
	source,
	variants,
}: {
	source: UpsertProductSource;
	variants: UpdateCatalogPlanParams["variants"];
}): CatalogVariantParams[] | undefined =>
	source === "direct" ? variants : undefined;
