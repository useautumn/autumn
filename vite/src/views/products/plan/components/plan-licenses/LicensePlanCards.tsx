import { isLicenseProduct } from "@autumn/shared";
import { useMemo } from "react";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { LicensePlanCard } from "./LicensePlanCard";
import {
	pendingPlanLicense,
	usePendingLicenseLinks,
} from "./PendingLicenseLinksContext";

export function LicensePlanCards() {
	const { product } = useProduct();
	// The parent editor's sheet state (context in the inline editor, global
	// store on the plan page) — used to dim cards while it has a sheet open.
	const { sheetType } = useSheet();
	const isParentSheetOpen = sheetType !== null;
	const isLicense = isLicenseProduct({ product });

	const { planLicenses } = usePlanLicensesQuery(
		isLicense ? undefined : product.id,
	);
	const { licenseProducts } = useLicenseProductsQuery();
	const { pendingLicenseIds } = usePendingLicenseLinks();

	const licenseById = useMemo(
		() => new Map(licenseProducts.map((license) => [license.id, license])),
		[licenseProducts],
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
			{allPlanLicenses.map((planLicense) => {
				const license = licenseById.get(planLicense.license_plan_id);
				if (!license) return null;
				return (
					<LicensePlanCard
						key={planLicense.id}
						planLicense={planLicense}
						license={license}
						parentPlanId={product.id}
						isPendingLink={pendingPlanLicenses.includes(planLicense)}
						isParentSheetOpen={isParentSheetOpen}
					/>
				);
			})}
		</div>
	);
}
