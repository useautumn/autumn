import type { Membership } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Item, Row } from "@/components/general/TableGrid";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { authClient, useSession } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

const ROLE_OPTIONS = ["member", "admin", "owner"] as const;

const MemberRoleSelect = ({
	membership,
	onRoleChanged,
}: {
	membership: Membership;
	onRoleChanged: () => void;
}) => {
	const [loading, setLoading] = useState(false);

	const handleRoleChange = async (newRole: string) => {
		if (newRole === membership.member.role) return;

		setLoading(true);
		try {
			const { error } = await authClient.organization.updateMemberRole({
				memberId: membership.member.id,
				role: newRole as "member" | "admin" | "owner",
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

	return (
		<Select
			value={membership.member.role}
			onValueChange={handleRoleChange}
			disabled={loading}
		>
			<SelectTrigger className="h-7 w-[100px] text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{ROLE_OPTIONS.map((role) => (
					<SelectItem key={role} value={role}>
						{role.charAt(0).toUpperCase() + role.slice(1)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
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

	const currentMembership = memberships.find(
		(membership: Membership) => membership.user.id === data?.session?.userId,
	);

	const isAdmin =
		currentMembership?.member.role === "admin" ||
		currentMembership?.member.role === "owner";

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
				return (
					<Row key={membership.user.id} className="flex px-6 text-sm text-t2">
						<Item className="flex-[6]">{user.email}</Item>
						<Item className="flex-[5] text-t3">{user.name || "No name"}</Item>
						<Item className="flex-[3]">
							{isAdmin ? (
								<MemberRoleSelect
									membership={membership}
									onRoleChanged={refetch}
								/>
							) : (
								<Badge variant="outline">{member.role}</Badge>
							)}
						</Item>
						<Item className="flex-[3]">{formatDateStr(member.createdAt)}</Item>
						<Item className="flex-[1] flex justify-end">
							{isAdmin && member.role !== "owner" && (
								<MemberRowToolbar membership={membership} />
							)}
						</Item>
					</Row>
				);
			})}
		</div>
	);
};
