import type {
	CatalogVariantParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductSource } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** variants[] rides only on the direct base entry — siblings do not inherit it. */
export const declaredVariantsForSource = ({
	source,
	variants,
}: {
	source: UpsertProductSource;
	variants: UpdateCatalogPlanParams["variants"];
}): CatalogVariantParams[] | undefined =>
	source === "direct" ? variants : undefined;
