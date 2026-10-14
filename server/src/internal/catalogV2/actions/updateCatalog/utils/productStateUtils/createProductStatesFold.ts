import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { projectProductStatesContext } from "./projectProductStatesContext";

export const createProductStatesFold = ({
	original,
}: {
	original: ProductStatesContext;
}) => {
	const upsertProducts: UpsertProductPlan[] = [];
	let projected = original;

	return {
		get projected() {
			return projected;
		},
		advance: ({ upsert }: { upsert: UpsertProductPlan }) => {
			upsertProducts.push(upsert);
			projected = projectProductStatesContext({ original, upsertProducts });
		},
	};
};
