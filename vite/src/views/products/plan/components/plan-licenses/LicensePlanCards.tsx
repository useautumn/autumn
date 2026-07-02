import { isLicenseProduct } from "@autumn/shared";
import { useMemo } from "react";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { LicensePlanCard } from "./LicensePlanCard";

export function LicensePlanCards() {
	const { product } = useProduct();
	const isLicense = isLicenseProduct({ product });

	const { planLicenses } = usePlanLicensesQuery(
		isLicense ? undefined : product.id,
	);
	const { licenseProducts } = useLicenseProductsQuery();

	const licenseById = useMemo(
		() => new Map(licenseProducts.map((license) => [license.id, license])),
		[licenseProducts],
	);

	if (isLicense || planLicenses.length === 0) return null;

	return (
		<div className="flex w-full flex-col items-center gap-4">
			{planLicenses.map((planLicense) => {
				const license = licenseById.get(planLicense.license_plan_id);
				if (!license) return null;
				return (
					<LicensePlanCard
						key={planLicense.id}
						planLicense={planLicense}
						license={license}
						parentPlanId={product.id}
					/>
				);
			})}
		</div>
	);
}
