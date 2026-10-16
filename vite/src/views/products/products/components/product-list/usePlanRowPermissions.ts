import type { ProductV2 } from "@autumn/shared";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";

/** Env copies and variants create a plan; named-sandbox copies use the platform scope; unarchive updates. */
export const usePlanRowPermissions = ({
	product,
	hasOtherSandboxes,
}: {
	product: ProductV2;
	hasOtherSandboxes: boolean;
}) => {
	const canCreate = useCanDo(APPROVAL_OPENERS.createPlan);
	const canDelete = useCanDo(
		product.archived
			? APPROVAL_OPENERS.updatePlan
			: APPROVAL_OPENERS.deletePlan,
	);
	const isVariant = Boolean(product.base_internal_product_id);
	const canCopyToEnv = canCreate && !isVariant;
	return {
		showCopyMenu: !isVariant && (canCreate || hasOtherSandboxes),
		canCopyToEnv,
		showSandboxSeparator: canCopyToEnv && hasOtherSandboxes,
		canCreateVariant: canCopyToEnv && !product.archived,
		canDelete,
	};
};
