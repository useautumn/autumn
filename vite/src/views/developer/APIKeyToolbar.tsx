import SmallSpinner from "@/components/general/SmallSpinner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { useDevContext } from "./DevContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { DevService } from "@/services/DevService";
import { ApiKey } from "@autumn/shared";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Delete } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DeleteApiKey } from "./api-keys/DeleteApiKey";

export const APIKeyToolbar = ({ apiKey }: { apiKey: ApiKey }) => {
  const { mutate, env } = useDevContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await DevService.deleteAPIKey(axiosInstance, apiKey.id);
      await mutate();
    } catch (error) {
      toast.error("Failed to delete API key");
    }
    setDeleteLoading(false);
    setDeleteOpen(false);
  };
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DeleteApiKey apiKey={apiKey} setOpen={setDialogOpen} />
        <DropdownMenuTrigger asChild>
          <ToolbarButton />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2">
          <DialogTrigger asChild>
            <DropdownMenuItem
              className="flex items-center"
              onClick={async (e) => {
                // e.stopPropagation();
                // e.preventDefault();
                // await handleDelete();
              }}
            >
              <div className="flex items-center justify-between w-full gap-2">
                Delete
                {deleteLoading ? <SmallSpinner /> : <Delete size={12} />}
              </div>
            </DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
    </Dialog>
  );
};
