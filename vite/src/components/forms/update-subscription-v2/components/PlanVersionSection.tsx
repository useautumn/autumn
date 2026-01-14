import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface PlanVersionSectionProps {
	form: UseUpdateSubscriptionForm;
	numVersions: number;
	currentVersion: number;
}

export function PlanVersionSection({
	form,
	numVersions,
	currentVersion,
}: PlanVersionSectionProps) {
	if (numVersions <= 1) return null;

	const versionOptions = Array.from(
		{ length: numVersions },
		(_, index) => numVersions - index,
	).map((version) => ({
		label: `Version ${version}${version === currentVersion ? " (current)" : ""}`,
		value: version,
	}));

	return (
		<SheetSection title="Plan Version" withSeparator>
			<div className="flex flex-col gap-2">
				<form.AppField name="version">
					{(field) => (
						<field.SelectField
							label=""
							placeholder={`Version ${currentVersion} (current)`}
							options={versionOptions}
							hideFieldInfo
						/>
					)}
				</form.AppField>
			</div>
		</SheetSection>
	);
}
