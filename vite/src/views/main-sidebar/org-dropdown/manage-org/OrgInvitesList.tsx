import type { Invite, Role } from "@autumn/shared";
import { Badge, TableCell, TableRow } from "@autumn/ui";
import { isFuture } from "date-fns";
import { ROLE_META } from "@/components/v2/selects/RoleSelect";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
} from "@/views/settings/SettingsTable";
import { useCurrentMembership } from "../hooks/useCurrentMembership";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

const COLUMNS = [
	{ label: "Email", width: "35%" },
	{ label: "Status", width: "20%" },
	{ label: "Role", width: "20%" },
	{ label: "Expires", width: "20%" },
] as const;

export const OrgInvitesList = () => {
	const { invites, isLoading } = useMemberships();
	const { isAdmin } = useCurrentMembership();

	if (isLoading) return null;

	const pendingInvites = invites.filter((invite: Invite) => {
		if (!invite.expiresAt) return false;
		return isFuture(new Date(invite.expiresAt));
	});

	if (pendingInvites.length === 0) {
		return (
			<p className="text-tertiary-foreground text-sm py-4">
				No pending invites
			</p>
		);
	}

	return (
		<SettingsTable columns={COLUMNS}>
			{pendingInvites.map((invite: Invite) => {
				const roleLabel =
					(invite.role && ROLE_META[invite.role as Role]?.label) ??
					invite.role ??
					"";
				return (
					<TableRow key={invite.id} className={SETTINGS_ROW_CLASS}>
						<TableCell className="pl-4 text-foreground">
							{invite.email}
						</TableCell>
						<TableCell className="text-tertiary-foreground">
							{invite.status}
						</TableCell>
						<TableCell>
							<Badge variant="muted">{roleLabel}</Badge>
						</TableCell>
						<TableCell className="text-tertiary-foreground text-xs">
							{formatDateStr(invite.expiresAt)}
						</TableCell>
						<TableCell className="pr-2">
							<div className="flex justify-end">
								{isAdmin && <MemberRowToolbar invite={invite} />}
							</div>
						</TableCell>
					</TableRow>
				);
			})}
		</SettingsTable>
	);
};
