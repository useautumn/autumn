import type { PlanLicense, ProductV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { LicenseEditorProvider } from "./LicenseEditorProvider";
import { LicensePlanCardEditor } from "./LicensePlanCardEditor";
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

	const { seededProduct, buildEntry, buildCustomize } = useLicenseCardEditor({
		planLicense,
		license,
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
				buildCustomize={buildCustomize}
				isPendingLink={isPendingLink}
				isLast={isLast}
			/>
		</LicenseEditorProvider>
	);
}
