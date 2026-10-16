import type { ProductV2 } from "@autumn/shared";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";

/** Copy and variants create a plan; unarchive updates one. */
export const usePlanRowPermissions = ({ product }: { product: ProductV2 }) => {
	const canCreate = useCanDo(APPROVAL_OPENERS.createPlan);
	const canDelete = useCanDo(
		product.archived
			? APPROVAL_OPENERS.updatePlan
			: APPROVAL_OPENERS.deletePlan,
	);
	return {
		canCopy: canCreate && !product.base_internal_product_id,
		canDelete,
	};
};
