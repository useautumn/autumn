import type { Membership, Role } from "@autumn/shared";
import { TableCell, TableRow } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { RoleSelect } from "@/components/v2/selects/RoleSelect";
import { authClient, useSession } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
} from "@/views/settings/SettingsTable";
import { useCurrentMembership } from "../hooks/useCurrentMembership";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

const NON_OWNER_ROLES: Role[] = ["admin", "developer", "sales", "member"];
const ALL_ROLES: Role[] = ["owner", ...NON_OWNER_ROLES];

const COLUMNS = [
	{ label: "Email", width: "35%" },
	{ label: "Name", width: "20%" },
	{ label: "Role", width: "20%" },
	{ label: "Created", width: "20%" },
] as const;

const MemberRoleSelect = ({
	membership,
	allowOwnerPromotion,
	disabled,
	onRoleChanged,
}: {
	membership: Membership;
	allowOwnerPromotion: boolean;
	disabled?: boolean;
	onRoleChanged: () => void;
}) => {
	const [loading, setLoading] = useState(false);
	const currentRole = membership.member.role as Role;

	const handleRoleChange = async (newRole: Role) => {
		if (newRole === currentRole) return;
		setLoading(true);
		try {
			const { error } = await authClient.organization.updateMemberRole({
				memberId: membership.member.id,
				role: newRole,
			});
			if (error) {
				toast.error(error.message ?? "Failed to update role");
				return;
			}
			toast.success(`Role updated to ${newRole}`);
			onRoleChanged();
		} catch {
			toast.error("Failed to update role");
		} finally {
			setLoading(false);
		}
	};

	const allowed = allowOwnerPromotion ? ALL_ROLES : NON_OWNER_ROLES;

	return (
		<RoleSelect
			value={currentRole}
			onChange={handleRoleChange}
			allowed={allowed}
			disabled={disabled || loading}
			className="h-7 w-[120px] text-xs"
		/>
	);
};

export const OrgMembersList = () => {
	const { memberships, isLoading, refetch } = useMemberships();
	const { currentRole, isAdmin, userId } = useCurrentMembership();

	if (isLoading) return null;

	return (
		<SettingsTable columns={COLUMNS}>
			{memberships.map((membership: Membership) => {
				const user = membership.user;
				const member = membership.member;
				const memberRole = member.role as Role;
				const isSelf = user.id === userId;
				const isOwnerUser = currentRole === "owner";
				const canEdit = memberRole !== "owner" && (isAdmin || isSelf);
				const canPromoteToOwner =
					isOwnerUser && memberRole !== "owner" && canEdit;

				return (
					<TableRow key={user.id} className={SETTINGS_ROW_CLASS}>
						<TableCell className="pl-4 text-foreground">{user.email}</TableCell>
						<TableCell className="text-tertiary-foreground">
							{user.name || "No name"}
						</TableCell>
						<TableCell>
							<MemberRoleSelect
								membership={membership}
								allowOwnerPromotion={canPromoteToOwner}
								disabled={!canEdit}
								onRoleChanged={refetch}
							/>
						</TableCell>
						<TableCell className="text-tertiary-foreground text-xs">
							{formatDateStr(member.createdAt)}
						</TableCell>
						<TableCell className="pr-2">
							<div className="flex justify-end">
								{isAdmin && memberRole !== "owner" && !isSelf && (
									<MemberRowToolbar membership={membership} />
								)}
							</div>
						</TableCell>
					</TableRow>
				);
			})}
		</SettingsTable>
	);
};
