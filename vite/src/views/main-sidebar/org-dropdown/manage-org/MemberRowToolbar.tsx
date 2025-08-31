import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useOrg } from "@/hooks/useOrg";
import { authClient } from "@/lib/auth-client";
import { Invite, Membership, OrgRole, ROLE_DISPLAY_NAMES } from "@autumn/shared";
import { TrashIcon, UserCog, Crown, Shield, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMemberships } from "../hooks/useMemberships";
import { useSession } from "@/lib/auth-client";

export const MemberRowToolbar = ({
  membership,
  invite,
}: {
  membership?: Membership;
  invite?: Invite;
}) => {
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { org } = useOrg();
  const { mutate } = useMemberships();
  const { data: session } = useSession();
  const { memberships } = useMemberships();

  // Get current user's role and permissions
  const currentUserMembership = memberships.find(
    (m: any) => m.user.id === session?.session?.userId
  );
  const currentUserRole = currentUserMembership?.member.role as OrgRole;

  // Check if current user can manage this member
  const canManageMember = () => {
    if (!membership || !currentUserRole) return false;
    
    const memberRole = membership.member.role as OrgRole;
    
    // Can't manage yourself
    if (membership.user.id === session?.session?.userId) return false;
    
    // Owner can manage everyone
    if (currentUserRole === OrgRole.Owner) return true;
    
    // Admin can manage members but not other admins or owners
    if (currentUserRole === OrgRole.Admin) {
      return memberRole === OrgRole.Member;
    }
    
    return false;
  };

  // Get available roles for this member
  const getAvailableRoles = () => {
    if (!canManageMember()) return [];
    
    const memberRole = membership?.member.role as OrgRole;
    
    if (currentUserRole === OrgRole.Owner) {
      // Owner can assign any role except to themselves
      if (membership?.user.id === session?.session?.userId) {
        return []; // Can't change own role
      }
      return Object.values(OrgRole);
    } else if (currentUserRole === OrgRole.Admin) {
      // Admin can only promote members to admin
      if (memberRole === OrgRole.Member) {
        return [OrgRole.Admin];
      }
      return [];
    }
    
    return [];
  };

  const handleDeleteMember = async (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    setDeleteLoading(true);
    try {
      const { data, error } = await authClient.organization.removeMember({
        memberIdOrEmail: membership!.member.id,
        organizationId: org.id,
      });

      if (error) {
        toast.error(error.message);
      } else {
        await mutate();
        toast.success("Member removed");
      }
    } catch (error) {
      toast.error("Failed to remove member");
    }
    setDeleteLoading(false);
  };

  const handleDeleteInvite = async (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    setDeleteLoading(true);
    try {
      const { data, error } = await authClient.organization.cancelInvitation({
        invitationId: invite!.id,
      });
      if (error) {
        toast.error(error.message);
      }

      await mutate();
      toast.success("Invite cancelled");
    } catch (error) {
      toast.error("Failed to remove invite");
    }
    setDeleteLoading(false);
  };

  const handleRoleChange = async (newRole: OrgRole) => {
    if (!membership) return;
    
    setRoleLoading(true);
    try {
      // Update member role via auth client
      const { data, error } = await authClient.organization.updateMemberRole({
        memberId: membership.member.id,
        organizationId: org.id,
        role: newRole,
      });

      if (error) {
        toast.error(error.message);
      } else {
        await mutate();
        toast.success(`Role updated to ${ROLE_DISPLAY_NAMES[newRole]}`);
      }
    } catch (error) {
      toast.error("Failed to update role");
    }
    setRoleLoading(false);
  };

  const getRoleIcon = (role: OrgRole) => {
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

  const availableRoles = getAvailableRoles();
  const canManage = canManageMember();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {membership && canManage && availableRoles.length > 0 && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 text-t2">
                <UserCog size={12} />
                <span>Change Role</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {availableRoles.map((role) => (
                  <DropdownMenuItem
                    key={role}
                    className="flex justify-between items-center"
                    onClick={() => handleRoleChange(role)}
                    disabled={roleLoading}
                  >
                    <div className="flex items-center gap-2">
                      {getRoleIcon(role)}
                      <span>{ROLE_DISPLAY_NAMES[role]}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem
          shimmer={deleteLoading}
          className="flex justify-between text-t2"
          onClick={(e) => {
            if (membership) {
              handleDeleteMember(e);
            } else {
              handleDeleteInvite(e);
            }
          }}
        >
          <div className="flex justify-between items-center w-full">
            <span>{membership ? "Remove" : "Cancel Invite"}</span>
            <TrashIcon size={12} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
