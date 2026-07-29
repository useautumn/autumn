import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useOptionalProductContext } from "@/views/products/product/ProductContext";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";

export const useLinkableLicenses = () => {
	const { product } = useProduct();
	const isLicense = useIsLicenseEditor();
	const productContext = useOptionalProductContext();
	const pagePlanLicenses = productContext?.catalogLicenses.map(
		({ planLicense }) => planLicense,
	);

	const { planLicenses: fallbackPlanLicenses } = usePlanLicensesQuery(
		isLicense || pagePlanLicenses ? undefined : product.id,
	);
	const planLicenses = pagePlanLicenses ?? fallbackPlanLicenses;
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
