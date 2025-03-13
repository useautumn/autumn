import SmallSpinner from "@/components/general/SmallSpinner";
import { faTrash } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Feature } from "@autumn/shared";
import { FeatureService } from "@/services/FeatureService";
import { getBackendErr } from "@/utils/genUtils";
import { useFeaturesContext } from "../features/FeaturesContext";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";

export const CreditSystemRowToolbar = ({
  creditSystem,
}: {
  creditSystem: Feature;
}) => {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);

    try {
      await FeatureService.deleteFeature(axiosInstance, creditSystem.id);
      await mutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to delete feature"));
    }

    setDeleteLoading(false);
    setDeleteOpen(false);
  };
  return (
    <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton />
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
