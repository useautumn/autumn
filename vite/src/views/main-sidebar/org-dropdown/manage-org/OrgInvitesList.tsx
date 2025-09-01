import type { Invite, Membership } from "@autumn/shared";
import { Item, Row } from "@/components/general/TableGrid";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
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

	return (
		<div className="h-full overflow-y-auto">
			<Row type="header" className={cn("grid-cols-18 px-6")}>
				<Item className="col-span-6">Email</Item>
				<Item className="col-span-3">Status</Item>
				<Item className="col-span-3">Role</Item>
				<Item className="col-span-2"></Item>
				<Item className="col-span-3">Expires At</Item>
				<Item className="col-span-1"></Item>
			</Row>
			{invites.map((invite: Invite) => {
				return (
					<Row
						key={invite.id}
						className={cn("grid-cols-18 px-6 text-sm text-t2")}
					>
						<Item className="col-span-6">{invite.email}</Item>
						<Item className="col-span-3">{invite.status}</Item>
						<Item className="col-span-3">
							<Badge variant="outline">{invite.role}</Badge>
						</Item>
						<Item className="col-span-2"></Item>
						<Item className="col-span-3">
							{formatDateStr(invite.expiresAt)}
						</Item>
						<Item className="col-span-1 flex justify-end">
							{isAdmin && <MemberRowToolbar invite={invite} />}
						</Item>
					</Row>
				);
			})}
		</div>
	);
};
