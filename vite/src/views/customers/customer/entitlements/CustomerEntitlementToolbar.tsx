import SmallSpinner from "@/components/general/SmallSpinner";
import { faEllipsisVertical, faTrash } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Entitlement } from "@autumn/shared";
import { cn } from "@/lib/utils";

export const CustomerEntitlementToolbar = ({
  className,
  entitlement,
}: {
  className?: string;
  entitlement: Entitlement;
}) => {
  //   const { mutate, env } = useDevContext();
  //   const axiosInstance = useAxiosInstance(env);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      //   await DevService.deleteAPIKey(axiosInstance, apiKey.id);
      //   await mutate();
    } catch (error) {
      toast.error("Failed to delete entitlement");
    }
    setDeleteLoading(false);
    setDeleteOpen(false);
  };
  return (
    <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          isIcon
          variant="ghost"
          dim={6}
          className={cn("rounded-full", className)}
        >
          <FontAwesomeIcon icon={faEllipsisVertical} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        <DropdownMenuItem
          className="flex items-center"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await handleDelete();
          }}
        >
          <div className="flex items-center justify-between w-full gap-2">
            Delete
            {deleteLoading ? (
              <SmallSpinner />
            ) : (
              <FontAwesomeIcon icon={faTrash} size="sm" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
