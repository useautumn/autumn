import { useMemberships } from "../hooks/useMemberships";
import { Membership } from "@autumn/shared";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Item, Row } from "@/components/general/TableGrid";
import { cn } from "@/lib/utils";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { Badge } from "@/components/ui/badge";
import { InvitePopover } from "./InvitePopover";
import { useSession } from "@/lib/auth-client";
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
    <div className="h-full overflow-y-auto bg-background">
      {/* <PageSectionHeader
        title="Members"
        isOnboarding={true}
        className="px-6"
        classNames={{
          title: "text-foreground",
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
            className={cn("grid-cols-18 px-6 text-sm text-foreground")}
          >
            <Item className="col-span-6">{user.email}</Item>
            <Item className="col-span-5">{user.name}</Item>
            <Item className="col-span-3">
              <Badge variant="outline">{member.role}</Badge>
            </Item>
            {/* <Item className="col-span-0"></Item> */}
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
