import { SettingsSection } from "../SettingsSection";
import { OrgUsageAlertsSubsection } from "./components/OrgUsageAlertsSubsection";

export const UsageAlertsSection = () => {
	return (
		<SettingsSection
			title="Usage Alerts"
			description="Configure org-wide usage alerts that fire for every customer when their balance crosses a threshold."
		>
			<OrgUsageAlertsSubsection />
		</SettingsSection>
	);
};
