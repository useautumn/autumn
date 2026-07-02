import type { PlanLicense, ProductV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { LicenseEditorProvider } from "./LicenseEditorProvider";
import { LicensePlanCardEditor } from "./LicensePlanCardEditor";
import { planLicenseItems } from "./licenseCustomizeUtils";
import { useLicenseCustomize } from "./useLicenseCustomize";

export function LicensePlanCard({
	planLicense,
	license,
	parentPlanId,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	parentPlanId: string;
}) {
	const { features } = useFeaturesQuery();
	const items = planLicenseItems({ planLicense, license, features });

	const { seededProduct, save } = useLicenseCustomize({
		parentPlanId,
		planLicense,
		license,
		items,
	});

	return (
		<LicenseEditorProvider initialProduct={seededProduct}>
			<LicensePlanCardEditor
				planLicense={planLicense}
				license={license}
				onSave={save}
			/>
		</LicenseEditorProvider>
	);
}
