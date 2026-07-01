import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui";
import { OrgDetails } from "@/views/main-sidebar/components/OrgDetails";
import { SettingsSection } from "../SettingsSection";
import { OrgSecurityCard } from "./components/OrgSecurityCard";

export const OrganizationSection = () => {
	return (
		<SettingsSection
			title="Organization"
			description="Manage your organization name, logo, and settings"
		>
			<Card className="shadow-none bg-interactive-secondary">
				<CardHeader>
					<CardTitle>General</CardTitle>
					<CardDescription>
						Update your organization details and branding
					</CardDescription>
				</CardHeader>
				<CardContent>
					<OrgDetails />
				</CardContent>
			</Card>
			<OrgSecurityCard />
		</SettingsSection>
	);
};
