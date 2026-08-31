import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";

/** Same variant row (resolved version / slug / active) under two base rows. */
export const handleDeclaredVariantAnchorErrors = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): void => {
	const parentByVariantKey = new Map<string, string>();

	for (const entry of params.plans) {
		if (entry.variants === undefined) continue;
		const parent = fullProductForPlanParams({
			planParams: entry,
			productStatesContext,
		});
		if (!parent) continue;

		for (const variant of entry.variants) {
			if (variant.base_variant_id === null) continue;
			const target = fullProductForPlanParams({
				planParams: {
					plan_id: variant.variant_plan_id,
					version: variant.version,
					version_slug: variant.version_slug,
				},
				productStatesContext,
			});
			const key =
				target?.internal_id ??
				`${variant.variant_plan_id}@${variant.version ?? variant.version_slug ?? "new"}`;
			const previous = parentByVariantKey.get(key);
			if (previous && previous !== parent.internal_id) {
				throw new RecaseError({
					message: `Variant ${variant.variant_plan_id} cannot be declared under two different base rows`,
					code: ErrCode.ConflictingVariantAnchor,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			parentByVariantKey.set(key, parent.internal_id);
		}
	}
};
