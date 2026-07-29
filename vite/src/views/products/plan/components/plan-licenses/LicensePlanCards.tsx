import { useIsLicenseEditor } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { LicensePlanCard } from "./LicensePlanCard";
import { useResolvedPlanLicenses } from "./useResolvedPlanLicenses";

export function LicensePlanCards() {
	const isLicense = useIsLicenseEditor();
	const resolved = useResolvedPlanLicenses();

	if (isLicense || resolved.length === 0) return null;

	return (
		<div className="flex w-full flex-col items-center gap-4">
			{resolved.map(({ planLicense, license, isPendingLink }, index) => (
				<LicensePlanCard
					key={planLicense.id}
					planLicense={planLicense}
					license={license}
					isPendingLink={isPendingLink}
					isLast={index === resolved.length - 1}
				/>
			))}
		</div>
	);
}
