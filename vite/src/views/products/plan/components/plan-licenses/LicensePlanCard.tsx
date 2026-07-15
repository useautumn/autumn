import type { PlanLicense, ProductV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { LicenseEditorProvider } from "./LicenseEditorProvider";
import { LicensePlanCardEditor } from "./LicensePlanCardEditor";
import { planLicenseItems } from "./licenseCustomizeUtils";
import { useLicenseCardEditor } from "./useLicenseCardEditor";

export function LicensePlanCard({
	planLicense,
	license,
	isPendingLink = false,
	isLast = true,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	isPendingLink?: boolean;
	isLast?: boolean;
}) {
	const { features, isLoading: isFeaturesLoading } = useFeaturesQuery();
	const items = planLicenseItems({ license });

	const { seededProduct, buildEntry, saveItems, buildCustomize } =
		useLicenseCardEditor({
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
				buildEntry={buildEntry}
				saveItems={saveItems}
				buildCustomize={buildCustomize}
				isPendingLink={isPendingLink}
				isLast={isLast}
			/>
		</LicenseEditorProvider>
	);
}
