import { useCurrentMembership } from "@/views/main-sidebar/org-dropdown/hooks/useCurrentMembership";
import { DeleteOrgPopover } from "@/views/main-sidebar/org-dropdown/manage-org/DeleteOrgPopover";
import { LeaveOrgPopover } from "@/views/main-sidebar/org-dropdown/manage-org/LeaveOrgPopover";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "../../components/SettingsGroup";
import { SettingsListRow } from "../../components/SettingsListRow";

export const OrgDangerZone = () => {
	const { isOwner } = useCurrentMembership();

	return (
		<SettingsGroup title="Danger zone">
			<div className={SETTINGS_LIST_CLASS}>
				{isOwner ? (
					<SettingsListRow
						title="Delete organization"
						description="Removes this organization and all of its data. This can't be undone."
					>
						<DeleteOrgPopover />
					</SettingsListRow>
				) : (
					<SettingsListRow
						title="Leave organization"
						description="You'll lose access until someone invites you back."
					>
						<LeaveOrgPopover />
					</SettingsListRow>
				)}
			</div>
		</SettingsGroup>
	);
};
