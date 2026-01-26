import type { Membership } from "@autumn/shared";
import { Item, Row } from "@/components/general/TableGrid";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

export const OrgMembersList = () => {
	const { memberships, isLoading: isMembersLoading } = useMemberships();
	const { data } = useSession();

	if (isMembersLoading) return null;

	const membership = memberships.find(
		(membership: Membership) => membership.user.id === data?.session?.userId,
	);

	const isAdmin =
		membership?.member.role === "admin" || membership?.member.role === "owner";

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
							<Badge variant="outline">{member.role}</Badge>
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
