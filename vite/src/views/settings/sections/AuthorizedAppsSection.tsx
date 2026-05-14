import { AuthorizedApps } from "@/views/main-sidebar/components/AuthorizedApps";
import { SettingsSection } from "../SettingsSection";

export const AuthorizedAppsSection = () => {
	return (
		<SettingsSection
			title="Authorized Apps"
			description="External applications that have access to this organization"
		>
			<AuthorizedApps />
		</SettingsSection>
	);
};
