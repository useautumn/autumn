import type { Membership, Role } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Item, Row } from "@/components/general/TableGrid";
import { RoleSelect } from "@/components/v2/selects/RoleSelect";
import { authClient, useSession } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

const NON_OWNER_ROLES: Role[] = ["admin", "developer", "sales", "member"];
const ALL_ROLES: Role[] = ["owner", ...NON_OWNER_ROLES];

const MemberRoleSelect = ({
	membership,
	allowOwnerPromotion,
	disabled,
	onRoleChanged,
}: {
	membership: Membership;
	/**
	 * Whether to expose `owner` in the role list. Only true when the
	 * current user is themselves an owner (owners can promote others to
	 * co-owners; admins cannot).
	 */
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
			className="h-7 w-[140px] text-xs"
		/>
	);
};

export const OrgMembersList = () => {
	const {
		memberships,
		isLoading: isMembersLoading,
		refetch,
	} = useMemberships();
	const { data } = useSession();

	if (isMembersLoading) return null;

	const currentUserId = data?.session?.userId;
	const currentMembership = memberships.find(
		(membership: Membership) => membership.user.id === currentUserId,
	);

	const currentRole = currentMembership?.member.role as Role | undefined;
	const isAdmin = currentRole === "admin" || currentRole === "owner";

	return (
		<div className="h-full overflow-y-auto">
			<Row type="header" className="flex px-6">
				<Item className="flex-[6]">Email</Item>
				<Item className="flex-[5]">Name</Item>
				<Item className="flex-[3]">Role</Item>
				<Item className="flex-[3]">Created At</Item>
				<Item className="flex-[1]"></Item>
			</Row>
			{memberships.map((membership: Membership) => {
				const user = membership.user;
				const member = membership.member;
				const memberRole = member.role as Role;
				const isSelf = user.id === currentUserId;
				const isOwnerUser = currentRole === "owner";
				// Owners can never be demoted (only ownership transfer flows
				// change an existing owner's role). Non-admins can't edit
				// anyone. Admins can edit non-owner members. Users can always
				// demote themselves (unless they are an owner).
				const canEdit =
					memberRole !== "owner" && (isAdmin || isSelf);
				// Owner promotion is only available to other owners, and only
				// when editing a non-owner row.
				const canPromoteToOwner =
					isOwnerUser && memberRole !== "owner" && canEdit;

				return (
					<Row key={membership.user.id} className="flex px-6 text-sm text-t2">
						<Item className="flex-[6]">{user.email}</Item>
						<Item className="flex-[5] text-t3">{user.name || "No name"}</Item>
						<Item className="flex-[3]">
							<MemberRoleSelect
								membership={membership}
								allowOwnerPromotion={canPromoteToOwner}
								disabled={!canEdit}
								onRoleChanged={refetch}
							/>
						</Item>
						<Item className="flex-[3]">{formatDateStr(member.createdAt)}</Item>
						<Item className="flex-[1] flex justify-end">
							{isAdmin && memberRole !== "owner" && !isSelf && (
								<MemberRowToolbar membership={membership} />
							)}
						</Item>
					</Row>
				);
			})}
		</div>
	);
};
