import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductSource,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { FullProduct } from "@autumn/shared";
import { resolveBaseVariantIdPointer } from "./resolveBaseVariantIdPointer";
import {
	type DeclaredVariantsMap,
	declaredParentInternalIdForPlan,
	shouldUnlinkDirectVariant,
} from "./shouldUnlinkDirectVariant";

/** Pointer to write on this upsert. `undefined` leaves the column untouched. */
export const resolveUpsertVariantPointer = ({
	intent,
	source,
	planId,
	currentFullProduct,
	productStatesContext,
	declaredVariants,
}: {
	intent: ProductUpsertIntent;
	source: UpsertProductSource;
	planId: string;
	currentFullProduct: FullProduct | null;
	productStatesContext: ProductStatesContext;
	declaredVariants?: DeclaredVariantsMap;
}): string | null | undefined => {
	const fromField = resolveBaseVariantIdPointer({
		baseVariantId: intent.planParams.base_variant_id,
		productStatesContext,
	});
	if (fromField !== undefined) return fromField;

	const unlink =
		intent.unlink === true ||
		shouldUnlinkDirectVariant({
			source,
			planId,
			currentFullProduct,
			productStatesContext,
			declaredVariants,
		});
	if (unlink) return null;

	return (
		intent.baseInternalProductId ??
		declaredParentInternalIdForPlan({
			planId,
			declaredVariants,
		})
	);
};
