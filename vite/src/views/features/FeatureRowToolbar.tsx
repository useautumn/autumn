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
import { Delete, ArchiveRestore } from "lucide-react";
import { DeleteFeatureDialog } from "./components/DeleteFeatureDialog";

export const FeatureRowToolbar = ({
  className,
  feature,
}: {
  className?: string;
  feature: Feature;
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <>
      <DeleteFeatureDialog
        feature={feature}
        open={deleteDialogOpen}
        setOpen={setDeleteDialogOpen}
      />
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton className="!h-5 !w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-t2" align="end">
          <DropdownMenuItem
            className="flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setDeleteDialogOpen(true);
              setDropdownOpen(false);
            }}
          >
            <div className="flex items-center justify-between w-full gap-2">
              {feature.archived ? "Unarchive" : "Delete"}
              {feature.archived ? (
                <ArchiveRestore size={12} />
              ) : (
                <Delete size={12} />
              )}
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
