import type { ProductV2 } from "@autumn/shared";
import { useProductVersionsQuery } from "@/hooks/queries/useProductVersionsQuery";
import {
	resolveVariantRelationshipChange,
	type VariantRelationshipChange,
} from "../catalog/variantRelationshipChange";
import { useVariantLinkVisibility } from "./useVariantLinkVisibility";

/**
 * The base-plan picker's pending change, resolved against every version of
 * this plan. Versions load only once the picker moves; until they land,
 * `resolve()` throws so a save cannot relink half the family.
 */
export const useVariantRelationshipChange = (product: ProductV2) => {
	const { basePlanId: persistedBasePlanId, selectedBasePlan } =
		useVariantLinkVisibility(product);
	const relationshipChanged =
		product.base_id !== undefined && product.base_id !== persistedBasePlanId;
	const { versions, isLoading } = useProductVersionsQuery({
		productId: product.id,
		enabled: relationshipChanged,
	});

	const resolve = (): VariantRelationshipChange =>
		resolveVariantRelationshipChange({
			editedBasePlanId: product.base_id,
			persistedBasePlanId,
			selectedBaseVersion: selectedBasePlan?.version,
			variantVersions: relationshipChanged && !isLoading ? versions : undefined,
		});

	return { relationshipChanged, isLoading, resolve };
};
