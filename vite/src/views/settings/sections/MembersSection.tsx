import { Separator } from "@/components/v2/separator";
import { InvitePopover } from "@/views/main-sidebar/org-dropdown/manage-org/InvitePopover";
import { OrgInvitesList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgInvitesList";
import { OrgMembersList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgMembersList";
import { SettingsSection } from "../SettingsSection";

export const MembersSection = () => {
	return (
		<SettingsSection
			title="Members"
			description="Manage team members and invitations"
			actions={<InvitePopover />}
		>
			<OrgMembersList />
			<Separator />
			<div>
				<h3 className="text-sm font-medium text-muted-foreground mb-4">
					Pending Invites
				</h3>
				<OrgInvitesList />
			</div>
		</SettingsSection>
	);
};
