import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { deriveVariantAdopts } from "./adopts/deriveVariantAdopts";
import { deriveVariantCreates } from "./creates/deriveVariantCreates";
import { deriveVariantEdits } from "./edits/deriveVariantEdits";
import { deriveVariantMints } from "./mints/deriveVariantMints";

/** Creates + mints + edits for a folded base. Nested-base skip lives in derive. */
export const computeVariantPlan = ({
	intent,
	upsert,
	projectedProductStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	const mints = deriveVariantMints({
		intent,
		upsert,
		projectedProductStatesContext,
	});
	return [
		...deriveVariantCreates({
			upsert,
			projectedProductStatesContext,
		}),
		...deriveVariantAdopts({
			upsert,
			projectedProductStatesContext,
		}),
		...mints,
		...deriveVariantEdits({
			upsert,
			projectedProductStatesContext,
			mintedPlanIds: new Set(mints.map((intent) => intent.productKey.planId)),
		}),
	];
};
