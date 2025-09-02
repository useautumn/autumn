import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Feature } from "@autumn/shared";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Delete, ArchiveRestore } from "lucide-react";
import { DeleteFeatureDialog } from "./DeleteFeatureDialog";

export const FeatureRowToolbar = ({ feature }: { feature: Feature }) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <>
      <DeleteFeatureDialog
        feature={feature}
        open={deleteDialogOpen}
        setOpen={setDeleteDialogOpen}
        dropdownOpen={dropdownOpen}
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
