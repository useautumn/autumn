import type {
	BatchMigrationPatch,
	BatchMigrationRejection,
} from "../../types/index.js";

/**
 * Ordered ops project state: a later op targeting a product an earlier op
 * already produced a patch for would need to see that op's projected
 * output, which the compute phase does not model. Within one op the matched
 * products are distinct, so ANY duplicate product across patches is
 * cross-op overlap.
 */
export const checkOverlappingPatches = ({
	patches,
}: {
	patches: BatchMigrationPatch[];
}): BatchMigrationRejection[] => {
	const rejections: BatchMigrationRejection[] = [];
	const seenInternalProductIds = new Set<string>();

	for (const patch of patches) {
		if (seenInternalProductIds.has(patch.fromProduct.internal_id)) {
			rejections.push({
				code: "overlapping_operations",
				opIndex: patch.opIndex,
				planId: patch.planId,
				message:
					"Operation targets a product already touched by an earlier operation; ordered projection across ops is not batch-lowered yet.",
			});
		}
		seenInternalProductIds.add(patch.fromProduct.internal_id);
	}

	return rejections;
};
