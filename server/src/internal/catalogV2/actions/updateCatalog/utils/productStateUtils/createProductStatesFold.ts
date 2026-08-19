import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { projectProductStatesContext } from "./projectProductStatesContext";

/**
 * Progressive fold handle for `computeUpsertProductsPlan` — the
 * createCatalogComputeState analogue. Originals stay frozen; `projected`
 * always re-derives from originals + every folded upsert.
 */
export const createProductStatesFold = ({
	original,
}: {
	original: ProductStatesContext;
}) => {
	const upsertProducts: UpsertProductPlan[] = [];
	let projected = original;

	return {
		/** State after all folds so far — pass into the next compute / derive. */
		get projected() {
			return projected;
		},
		advance: ({ upsert }: { upsert: UpsertProductPlan }) => {
			upsertProducts.push(upsert);
			projected = projectProductStatesContext({ original, upsertProducts });
		},
	};
};
