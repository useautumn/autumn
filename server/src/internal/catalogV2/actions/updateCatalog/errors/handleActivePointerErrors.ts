import { ErrCode, RecaseError } from "@autumn/shared";
import { detectOrphanedActivePointers } from "@/internal/catalogV2/actions/updateCatalog/errors/detectOrphanedActivePointers";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** A plan keeping live versions must keep a live active one to attach to. */
export const handleActivePointerErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const [orphaned] = detectOrphanedActivePointers({
		products: updateCatalogPlan.projected.products,
		removedKeys: new Set(
			updateCatalogPlan.removePlans.map(
				(removePlan) => `${removePlan.planId}:${removePlan.version}`,
			),
		),
	});
	if (!orphaned) return;

	throw new RecaseError({
		message: `Cannot archive version ${orphaned.version} of plan ${orphaned.planId} while it is the active version and other versions remain. Promote another version first, or archive the whole plan.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
