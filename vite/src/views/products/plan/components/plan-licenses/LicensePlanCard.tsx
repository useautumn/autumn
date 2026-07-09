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
	isPendingLink = false,
	isLast = true,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	parentPlanId: string;
	isPendingLink?: boolean;
	isLast?: boolean;
}) {
	const { features, isLoading: isFeaturesLoading } = useFeaturesQuery();
	const items = planLicenseItems({ planLicense, license, features });

	const { seededProduct, save, buildCustomize } = useLicenseCustomize({
		parentPlanId,
		planLicense,
		license,
		items,
		features,
	});

	// The editor seeds once from initialProduct; mounting before features load
	// would bake an empty item set into the draft.
	if (isFeaturesLoading) return null;

	return (
		<LicenseEditorProvider initialProduct={seededProduct}>
			<LicensePlanCardEditor
				planLicense={planLicense}
				license={license}
				onSave={save}
				buildCustomize={buildCustomize}
				isPendingLink={isPendingLink}
				isLast={isLast}
			/>
		</LicenseEditorProvider>
	);
}
