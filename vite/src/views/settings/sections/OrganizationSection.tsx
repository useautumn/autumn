import { OrgDetails } from "@/views/main-sidebar/components/OrgDetails";
import { SettingsSection } from "../SettingsSection";
import { OrgDangerZone } from "./components/OrgDangerZone";

export const OrganizationSection = () => {
	return (
		<SettingsSection
			title="Organization"
			description="Your organization's name, logo and identifiers."
		>
			<OrgDetails />
			<OrgDangerZone />
		</SettingsSection>
	);
};
