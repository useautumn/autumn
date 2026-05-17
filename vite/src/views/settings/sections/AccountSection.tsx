import { UserDetails } from "@/views/main-sidebar/components/UserDetails";
import { SettingsSection } from "../SettingsSection";

export const AccountSection = () => {
	return (
		<SettingsSection
			title="Account"
			description="Manage your personal account details"
			card={{ title: "Profile", description: "Update your name and view your email address" }}
		>
			<UserDetails />
		</SettingsSection>
	);
};
