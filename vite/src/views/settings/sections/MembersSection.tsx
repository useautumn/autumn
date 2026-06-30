import { Separator } from "@autumn/ui";
import { useInNamedSandbox } from "@/hooks/sandbox/useInNamedSandbox";
import { InvitePopover } from "@/views/main-sidebar/org-dropdown/manage-org/InvitePopover";
import { OrgInvitesList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgInvitesList";
import { OrgMembersList } from "@/views/main-sidebar/org-dropdown/manage-org/OrgMembersList";
import { SettingsSection } from "../SettingsSection";

export const MembersSection = () => {
	const inNamedSandbox = useInNamedSandbox();

	return (
		<SettingsSection
			title="Members"
			description={
				inNamedSandbox
					? "Members are inherited from your organization and managed there"
					: "Manage team members and invitations"
			}
			actions={inNamedSandbox ? undefined : <InvitePopover />}
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
