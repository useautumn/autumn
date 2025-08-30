import { useMemberships } from "../hooks/useMemberships";
import { Invite, Membership, OrgRole, ROLE_DISPLAY_NAMES } from "@autumn/shared";
import { Item, Row } from "@/components/general/TableGrid";
import { cn } from "@/lib/utils";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { MemberRowToolbar } from "./MemberRowToolbar";
import { Crown, Shield, User } from "lucide-react";

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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case OrgRole.Owner:
        return <Crown size={12} className="text-yellow-600" />;
      case OrgRole.Admin:
        return <Shield size={12} className="text-blue-600" />;
      case OrgRole.Member:
        return <User size={12} className="text-gray-600" />;
      default:
        return <User size={12} />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case OrgRole.Owner:
        return "default";
      case OrgRole.Admin:
        return "secondary";
      case OrgRole.Member:
        return "outline";
      default:
        return "outline";
    }
  };

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
              <Badge variant={getRoleBadgeVariant(invite.role || "member")} className="flex items-center gap-1">
                {getRoleIcon(invite.role || "member")}
                {ROLE_DISPLAY_NAMES[invite.role as OrgRole] || invite.role || "Member"}
              </Badge>
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
