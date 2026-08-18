import type {
	BatchMigrationPatch,
	BatchMigrationRejection,
} from "../../types/index.js";

/**
 * Ordered ops project state: a patch whose source another patch already reads
 * or writes would need to see that patch's projected output, which the compute
 * phase does not model. Fanning several sources onto one shared target stays
 * provable, so repeated targets alone are not overlap.
 */
export const checkOverlappingPatches = ({
	patches,
}: {
	patches: BatchMigrationPatch[];
}): BatchMigrationRejection[] => {
	const rejections: BatchMigrationRejection[] = [];
	const sourceInternalProductIds = new Set<string>();
	const targetInternalProductIds = new Set<string>();

	for (const patch of patches) {
		const sourceId = patch.fromProduct.internal_id;
		const targetId = patch.toProduct.internal_id;
		if (
			sourceInternalProductIds.has(sourceId) ||
			targetInternalProductIds.has(sourceId) ||
			sourceInternalProductIds.has(targetId)
		) {
			rejections.push({
				code: "overlapping_operations",
				opIndex: patch.opIndex,
				planId: patch.planId,
				message:
					"Operation chains onto a product another operation already reads or writes; ordered projection across ops is not batch-lowered yet.",
			});
		}
		sourceInternalProductIds.add(sourceId);
		targetInternalProductIds.add(targetId);
	}

	return rejections;
};
