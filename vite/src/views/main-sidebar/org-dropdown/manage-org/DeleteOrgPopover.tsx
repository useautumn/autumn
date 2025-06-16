import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrg } from "@/hooks/useOrg";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useState } from "react";
import { toast } from "sonner";
import { useMemberships } from "../hooks/useMemberships";

export const DeleteOrgPopover = () => {
  const { org } = useOrg();
  const { data: organizations } = useListOrganizations();
  const { memberships } = useMemberships();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const axiosInstance = useAxiosInstance();

  const deleteOrg = async () => {
    if (!organizations || !memberships) {
      toast.error("Failed to delete org");
      return;
    }
    if (organizations.length === 1) {
      toast.error("You must have at least one organization");
      return;
    }

    if (memberships.length > 1) {
      toast.error("Can't delete org with multiple members");
      return;
    }

    if (confirmText !== org?.name) {
      toast.error("Please type the org name to confirm");
      return;
    }

    await axiosInstance.delete(`/organization`);

    // Other org is now the active org
    const otherOrg = organizations.find((o) => o.id !== org.id);
    await authClient.organization.setActive({
      organizationId: otherOrg!.id,
    });

    const { data, error } = await authClient.organization.delete({
      organizationId: org.id,
    });

    if (error) {
      throw error;
    }

    window.location.reload();
  };
  const handleDeleteClicked = async () => {
    setDeleting(true);
    try {
      await deleteOrg();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to delete org"));
    }

    setDeleting(false);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="destructive" className="w-fit">
          Delete Organization
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="border border-zinc-200">
        <div className="flex flex-col gap-4 text-sm w-fit">
          <p className="text-t3">
            Are you sure you want to delete this organization?
          </p>
          <Input
            variant="destructive"
            placeholder={`Type "${org?.name}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <Button
            variant="outline"
            className="w-fit"
            isLoading={deleting}
            onClick={handleDeleteClicked}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
