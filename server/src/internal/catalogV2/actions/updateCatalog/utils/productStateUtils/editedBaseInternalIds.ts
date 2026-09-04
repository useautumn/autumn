import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Base rows this upsert edits — what anchored variant rows must point at. */
export const editedBaseInternalIds = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): Set<string> =>
	new Set(
		[
			upsert.row.currentFullProduct?.internal_id,
			upsert.row.baseFullProduct?.internal_id,
			upsert.row.nextFullProduct.internal_id,
			upsert.previousActiveInternalId,
		].filter((internalId): internalId is string => internalId !== undefined),
	);
