import { ErrCode, RecaseError } from "@autumn/shared";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Remaining variants must still point at a live, unarchived base row. */
export const handleRemovePlanVariantErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const { projected, removePlans } = updateCatalogPlan;
	const remainingByInternalId = new Map(
		projected.products.map((product) => [product.internal_id, product]),
	);

	for (const product of projected.products) {
		const pointer = product.base_internal_product_id;
		if (!pointer) continue;

		const base = remainingByInternalId.get(pointer);
		if (base && !base.archived) continue;

		const planId =
			base?.id ??
			removePlans.find((row) => row.current?.internal_id === pointer)
				?.planId;
		if (!planId) continue;

		throw new RecaseError({
			message: `Cannot delete or archive plan ${planId} while it still has variants`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
