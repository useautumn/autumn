import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";

/**
 * Plans that can still be linked as a license to the current plan (any plan
 * except itself, archived ones, and those already linked or staged), plus the
 * stage action. Backs both link affordances: the plan toolbar's menu item and
 * the customize editor's button.
 */
export const useLinkableLicenses = () => {
	const { product } = useProduct();
	const isLicense = useIsLicenseEditor();

	const { planLicenses } = usePlanLicensesQuery(
		isLicense ? undefined : product.id,
	);
	const { products } = useProductsQuery();
	const { pendingLicenseIds, addPendingLink } = usePendingLicenseLinks();

	const linkedIds = new Set([
		...planLicenses.map((planLicense) => planLicense.license_plan_id),
		...pendingLicenseIds,
	]);
	const candidatePlans = products.filter(
		(plan) => plan.id !== product.id && !plan.archived,
	);
	const availableLicenses = candidatePlans.filter(
		(plan) => !linkedIds.has(plan.id),
	);

	return {
		isLicense,
		hasAnyLinkablePlans: candidatePlans.length > 0,
		availableLicenses,
		linkLicense: addPendingLink,
	};
};
