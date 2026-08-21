import type { ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

/** Editor `base_id` is undefined until the picker changes; null means detach. */
export const resolveSelectedBasePlanId = ({
	editedBasePlanId,
	persistedBasePlanId,
	planId,
}: {
	editedBasePlanId: string | null | undefined;
	persistedBasePlanId: string | null;
	planId: string;
}): string | null =>
	editedBasePlanId === undefined || editedBasePlanId === planId
		? persistedBasePlanId
		: editedBasePlanId;

export function useVariantLinkVisibility(product: ProductV2) {
	const { products } = useProductsQuery();

	// base_id lives on the products-list entry, not the store product.
	const listedProduct = products.find((p) => p.id === product.id);
	const listedBasePlanId = listedProduct?.base_id || null;
	// A plan whose base row is another of its own versions resolves to its own id.
	const isSelfReferentialBase = listedBasePlanId === product.id;
	const basePlanId = isSelfReferentialBase ? null : listedBasePlanId;
	const basePlan = products.find((p) => p.id === basePlanId) ?? null;
	const hasVariants = products.some(
		(p) => p.id !== product.id && p.base_id === product.id,
	);
	// The backend rejects a variant as a base plan.
	const basePlanOptions = products.filter(
		(candidate) =>
			candidate.id !== product.id && !candidate.base_id && !candidate.archived,
	);

	const selectedBasePlanId = resolveSelectedBasePlanId({
		editedBasePlanId: product.base_id,
		persistedBasePlanId: basePlanId,
		planId: product.id,
	});

	return {
		isVariant: basePlanId !== null,
		hasVariants,
		basePlanId,
		selectedBasePlanId,
		basePlan,
		basePlanOptions,
	};
}
