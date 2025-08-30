import { useMemberships } from "../hooks/useMemberships";
import { Membership, OrgRole, ROLE_DISPLAY_NAMES } from "@autumn/shared";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Item, Row } from "@/components/general/TableGrid";
import { cn } from "@/lib/utils";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { Badge } from "@/components/ui/badge";
import { InvitePopover } from "./InvitePopover";
import { useSession } from "@/lib/auth-client";
import { MemberRowToolbar } from "./MemberRowToolbar";
import { Crown, Shield, User } from "lucide-react";

export const OrgMembersList = () => {
  const { memberships, isLoading: isMembersLoading } = useMemberships();
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
      {/* <PageSectionHeader
        title="Members"
        isOnboarding={true}
        className="px-6"
        classNames={{
          title: "text-t3",
        }}
        addButton={<InvitePopover />}
      /> */}

      <Row type="header" className={cn("grid-cols-18 px-6")}>
        <Item className="col-span-6">Email</Item>
        <Item className="col-span-5">Name</Item>
        <Item className="col-span-3">Role</Item>
        {/* <Item className="col-span-0"></Item> */}
        <Item className="col-span-3">Created At</Item>
        <Item className="col-span-1"></Item>
      </Row>
      {memberships.map((membership: Membership) => {
        const user = membership.user;
        const member = membership.member;
        return (
          <Row
            key={membership.user.id}
            className={cn("grid-cols-18 px-6 text-sm text-t2")}
          >
            <Item className="col-span-6">{user.email}</Item>
            <Item className="col-span-5">{user.name}</Item>
            <Item className="col-span-3">
            <Badge variant={getRoleBadgeVariant(member.role)} className="flex items-center gap-1">
                {getRoleIcon(member.role)}
                {ROLE_DISPLAY_NAMES[member.role as OrgRole] || member.role}
              </Badge>
            </Item>
            <Item className="col-span-3">
              {formatDateStr(member.createdAt)}
            </Item>
            <Item className="col-span-1 flex justify-end">
              {isAdmin && <MemberRowToolbar membership={membership} />}
            </Item>
          </Row>
        );
      })}
    </div>
  );
};
