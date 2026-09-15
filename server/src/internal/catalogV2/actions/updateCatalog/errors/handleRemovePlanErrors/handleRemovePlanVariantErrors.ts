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

		const removedBase = removePlans.find(
			(row) => row.current?.internal_id === pointer,
		);
		const planId = base?.id ?? removedBase?.planId;
		if (!planId) continue;
		const action =
			base?.archived || removedBase?.willArchive ? "archive" : "delete";
		const variant = product.archived ? "archived variant" : "variant";
		const actionGerund = action === "archive" ? "archiving" : "deleting";

		throw new RecaseError({
			message: `Cannot ${action} plan ${planId} because ${variant} ${product.id} would still link to it. Link the variant to another base version before ${actionGerund} this plan.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
