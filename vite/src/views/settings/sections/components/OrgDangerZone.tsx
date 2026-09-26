import type { Membership } from "@autumn/shared";
import { useCurrentMembership } from "@/views/main-sidebar/org-dropdown/hooks/useCurrentMembership";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { DeleteOrgPopover } from "@/views/main-sidebar/org-dropdown/manage-org/DeleteOrgPopover";
import { LeaveOrgPopover } from "@/views/main-sidebar/org-dropdown/manage-org/LeaveOrgPopover";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "../../components/SettingsGroup";
import { SettingsListRow } from "../../components/SettingsListRow";

export const OrgDangerZone = () => {
	const { isOwner } = useCurrentMembership();
	const { memberships } = useMemberships();
	const ownerCount = memberships.filter(
		(membership: Membership) => membership.member.role === "owner",
	).length;
	const canLeave = !isOwner || ownerCount > 1;

	return (
		<SettingsGroup title="Danger zone">
			<div className={SETTINGS_LIST_CLASS}>
				{canLeave && (
					<SettingsListRow
						title="Leave organization"
						description="You'll lose access until someone invites you back."
					>
						<LeaveOrgPopover />
					</SettingsListRow>
				)}
				{isOwner && (
					<SettingsListRow
						title="Delete organization"
						description="Removes this organization and all of its data. This can't be undone."
					>
						<DeleteOrgPopover />
					</SettingsListRow>
				)}
			</div>
		</SettingsGroup>
	);
};
