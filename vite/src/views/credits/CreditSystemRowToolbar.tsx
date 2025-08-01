import SmallSpinner from "@/components/general/SmallSpinner";
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
import { Delete } from "lucide-react";
import { DeleteFeatureDialog } from "../features/components/DeleteFeatureDialog";

export const CreditSystemRowToolbar = ({
  creditSystem,
}: {
  creditSystem: Feature;
}) => {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // const handleDelete = async () => {
  //   setDeleteLoading(true);

  //   try {
  //     await FeatureService.deleteFeature(axiosInstance, creditSystem.id);
  //     await mutate();
  //   } catch (error) {
  //     toast.error(getBackendErr(error, "Failed to delete feature"));
  //   }

  //   setDeleteLoading(false);
  //   setDeleteOpen(false);
  // };
  return (
    <>
      <DeleteFeatureDialog
        feature={creditSystem}
        open={deleteDialogOpen}
        setOpen={setDeleteDialogOpen}
      />

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2" align="end">
          <DropdownMenuItem
            className="flex items-center"
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              setDeleteDialogOpen(true);
              setDropdownOpen(false);
            }}
          >
            <div className="flex items-center justify-between w-full gap-2">
              Delete
              {deleteLoading ? (
                <SmallSpinner />
              ) : (
                <Delete size={14} className="text-t3" />
              )}
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
