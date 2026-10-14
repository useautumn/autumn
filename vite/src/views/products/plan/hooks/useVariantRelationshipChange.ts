import type { ProductV2 } from "@autumn/shared";
import { useProductVersionsQuery } from "@/hooks/queries/useProductVersionsQuery";
import {
	resolveVariantRelationshipChange,
	type VariantRelationshipChange,
} from "../catalog/variantRelationshipChange";
import { useVariantLinkVisibility } from "./useVariantLinkVisibility";

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
