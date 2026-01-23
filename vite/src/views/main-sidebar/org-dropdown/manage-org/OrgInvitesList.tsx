import type { Invite, Membership } from "@autumn/shared";
import { isFuture } from "date-fns";
import { Item, Row } from "@/components/general/TableGrid";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "../hooks/useMemberships";
import { MemberRowToolbar } from "./MemberRowToolbar";

export const OrgInvitesList = () => {
	const {
		memberships,
		invites,
		isLoading: isMembersLoading,
	} = useMemberships();
	const { data } = useSession();

	if (isMembersLoading) return null;
	const membership = memberships.find(
		(membership: Membership) => membership.user.id === data?.session?.userId,
	);
	const isAdmin =
		membership?.member.role === "admin" || membership?.member.role === "owner";

	const pendingInvites = invites.filter((invite: Invite) => {
		if (!invite.expiresAt) return false;
		return isFuture(new Date(invite.expiresAt));
	});

	if (pendingInvites.length === 0) {
		return (
			<div className="h-full flex items-center justify-center">
				<p className="text-t3 text-sm">No pending invites</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<Row type="header" className="flex px-6">
				<Item className="flex-6">Email</Item>
				<Item className="flex-5">Status</Item>
				<Item className="flex-3">Role</Item>
				<Item className="flex-3">Expires At</Item>
				<Item className="flex-1"></Item>
			</Row>
			{pendingInvites.map((invite: Invite) => {
				return (
					<Row key={invite.id} className="flex px-6 text-sm text-t2">
						<Item className="flex-6">{invite.email}</Item>
						<Item className="flex-5">{invite.status}</Item>
						<Item className="flex-3">
							<Badge variant="outline">{invite.role}</Badge>
						</Item>
						<Item className="flex-3">{formatDateStr(invite.expiresAt)}</Item>
						<Item className="flex-1 flex justify-end">
							{isAdmin && <MemberRowToolbar invite={invite} />}
						</Item>
					</Row>
				);
			})}
		</div>
	);
};
