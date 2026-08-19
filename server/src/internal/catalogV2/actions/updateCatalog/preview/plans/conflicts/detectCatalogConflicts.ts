import {
	type ApiPlanV1,
	type CatalogConflictPreview,
	type Feature,
	diffPlanV1,
} from "@autumn/shared";
import { detectVariantConflicts } from "@/internal/product/actions/previewUpdatePlan/detectVariantConflicts";

/** Lists slots where a relative plan (sibling version or customized license) diverged from the edit. */
export const detectCatalogConflicts = ({
	currentPlan,
	nextPlan,
	relativePlan,
	features,
}: {
	currentPlan: ApiPlanV1;
	nextPlan: ApiPlanV1;
	relativePlan: ApiPlanV1;
	features: Feature[];
}): CatalogConflictPreview[] =>
	detectVariantConflicts({
		currentBasePlan: currentPlan,
		editedBasePlan: nextPlan,
		diff: diffPlanV1({ from: currentPlan, to: nextPlan }),
		variantPlan: relativePlan,
		features,
	});
