import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrg } from "@/hooks/useOrg";
import { authClient } from "@/lib/auth-client";
import { Invite, Membership } from "@autumn/shared";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMemberships } from "../hooks/useMemberships";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const MemberRowToolbar = ({
  membership,
  invite,
}: {
  membership?: Membership;
  invite?: Invite;
}) => {
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { org } = useOrg();
  const { mutate } = useMemberships();
  const axiosInstance = useAxiosInstance();

  // Debug logging
  console.log("MemberRowToolbar props:", { membership, invite, org });

  const handleDeleteMember = async (e: any) => {
    e.preventDefault();
    e.stopPropagation();

    if (!membership) {
      console.error("No membership data available");
      toast.error("Cannot remove member: membership data not found");
      return;
    }

    setDeleteLoading(true);
    try {
      console.log("Removing member:", {
        memberId: membership.member.id,
        userId: membership.user.id,
        userEmail: membership.user.email,
        orgId: org.id,
        membership: membership
      });

      // Debug: Check if the IDs are valid
      if (!membership.member.id || !membership.user.id) {
        console.error("Invalid IDs:", {
          memberId: membership.member.id,
          userId: membership.user.id
        });
        toast.error("Invalid member data");
        return;
      }

      // Use our custom backend endpoint for member removal
      // This handles both the database cleanup and session invalidation
      const response = await axiosInstance.post("/organization/remove-member", {
        memberId: membership.member.id,
        userId: membership.user.id,
      });

      console.log("Backend member removal successful:", response);

      // Refresh the members list
      await mutate();
      toast.success("Member removed successfully");
      setOpen(false); // Close the dropdown
    } catch (error: any) {
      console.error("Member removal error:", error);
      if (error.response?.data?.code === "MEMBER_NOT_FOUND") {
        toast.error("Member not found in this organization");
      } else {
        toast.error("Failed to remove member. Please try again.");
      }
    } finally {
      setDeleteLoading(false);
    }
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

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
            <span>Remove</span>
            <TrashIcon size={12} />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
