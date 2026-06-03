import { OrgDetails } from "@/views/main-sidebar/components/OrgDetails";
import { SettingsSection } from "../SettingsSection";

export const OrganizationSection = () => {
	return (
		<SettingsSection
			title="Organization"
			description="Manage your organization name, logo, and settings"
			card={{
				title: "General",
				description: "Update your organization details and branding",
			}}
		>
			<OrgDetails />
		</SettingsSection>
	);
};
