import { useMemo } from "react";
import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { LicensePlanCard } from "./LicensePlanCard";
import {
	pendingPlanLicense,
	usePendingLicenseLinks,
} from "./PendingLicenseLinksContext";

export function LicensePlanCards() {
	const { product } = useProduct();
	const isLicense = useIsLicenseEditor();

	const { planLicenses } = usePlanLicensesQuery(
		isLicense ? undefined : product.id,
	);
	const { licenseProducts } = useLicenseProductsQuery();
	const { products } = useProductsQuery();
	const { pendingLicenseIds } = usePendingLicenseLinks();

	// Staged links can point at any plan, not just ones already linked
	// elsewhere, so fall back to the full plans list.
	const licenseById = useMemo(
		() =>
			new Map(
				[...products, ...licenseProducts].map((license) => [
					license.id,
					license,
				]),
			),
		[products, licenseProducts],
	);

	// Staged (unsaved) links render as cards too; dedupe against the persisted
	// list to cover the render between a save landing and the pending entry
	// being removed.
	const persistedIds = new Set(
		planLicenses.map((planLicense) => planLicense.license_plan_id),
	);
	const pendingPlanLicenses = pendingLicenseIds
		.filter((licenseId) => !persistedIds.has(licenseId))
		.map((licenseId) =>
			pendingPlanLicense({ licenseId, parentPlanId: product.id }),
		);

	const allPlanLicenses = [...planLicenses, ...pendingPlanLicenses];

	if (isLicense || allPlanLicenses.length === 0) return null;

	return (
		<div className="flex w-full flex-col items-center gap-4">
			{allPlanLicenses.map((planLicense, index) => {
				const license = licenseById.get(planLicense.license_plan_id);
				if (!license) return null;
				return (
					<LicensePlanCard
						key={planLicense.id}
						planLicense={planLicense}
						license={license}
						parentPlanId={product.id}
						isPendingLink={pendingPlanLicenses.includes(planLicense)}
						isLast={index === allPlanLicenses.length - 1}
					/>
				);
			})}
		</div>
	);
}
