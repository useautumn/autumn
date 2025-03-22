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
import { useFeaturesContext } from "./FeaturesContext";
import { FeatureService } from "@/services/FeatureService";
import { getBackendErr } from "@/utils/genUtils";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Delete } from "lucide-react";

export const FeatureRowToolbar = ({
  className,
  feature,
}: {
  className?: string;
  feature: Feature;
}) => {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await FeatureService.deleteFeature(axiosInstance, feature.id);
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
        <ToolbarButton className="!h-5 !w-5" />
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
            {deleteLoading ? <SmallSpinner /> : <Delete size={12} />}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
