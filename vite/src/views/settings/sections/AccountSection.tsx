import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui";
import { UserDetails } from "@/views/main-sidebar/components/UserDetails";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "../components/SettingsGroup";
import { SettingsListRow } from "../components/SettingsListRow";
import { SettingsSection } from "../SettingsSection";
import { DeleteAccountPopover } from "./components/DeleteAccountPopover";
import { PasskeysManager } from "./components/PasskeysManager";

export const AccountSection = () => {
	return (
		<SettingsSection
			title="Account"
			description="Manage your personal account details"
		>
			<Card className="shadow-none bg-interactive-secondary">
				<CardHeader>
					<CardTitle>Profile</CardTitle>
					<CardDescription>
						Update your name and view your email address
					</CardDescription>
				</CardHeader>
				<CardContent>
					<UserDetails />
				</CardContent>
			</Card>
			<Card className="shadow-none bg-interactive-secondary">
				<CardHeader>
					<CardTitle>Security</CardTitle>
					<CardDescription>
						Manage how you sign in to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<PasskeysManager />
				</CardContent>
			</Card>
			<SettingsGroup title="Danger zone">
				<div className={SETTINGS_LIST_CLASS}>
					<SettingsListRow
						title="Delete account"
						description="Permanently deletes your account and any organization you're the only member of. This can't be undone."
					>
						<DeleteAccountPopover />
					</SettingsListRow>
				</div>
			</SettingsGroup>
		</SettingsSection>
	);
};
