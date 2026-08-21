import {
	applyDiff,
	type DiffedCustomizePlanV1,
	type FullProduct,
	toCreatePlanItemParams,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";

/** When editDiff is set, content comes from applyDiff on the current row. */
export const planParamsFromEditDiff = ({
	planParams,
	editDiff,
	currentFullProduct,
}: {
	planParams: UpdateCatalogPlanParams;
	editDiff?: DiffedCustomizePlanV1;
	currentFullProduct: FullProduct | null;
}): UpdateCatalogPlanParams => {
	if (!editDiff || !currentFullProduct) return planParams;

	const applied = applyDiff({
		base: fullProductToApiPlanV1Sync({ product: currentFullProduct }),
		diff: editDiff,
	});

	const freeTrial = applied.free_trial
		? {
				...applied.free_trial,
				...(applied.free_trial.on_end == null
					? { on_end: undefined }
					: { on_end: applied.free_trial.on_end }),
			}
		: applied.free_trial;

	return {
		...planParams,
		items: applied.items.map((item) => toCreatePlanItemParams(item)),
		...(editDiff.price !== undefined
			? { price: applied.price ?? null }
			: {}),
		...(editDiff.free_trial !== undefined
			? { free_trial: freeTrial ?? null }
			: {}),
	};
};
