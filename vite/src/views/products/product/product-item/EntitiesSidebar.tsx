import {
  Feature,
  FeatureUsageType,
  ProductItem,
  ProductV2,
} from "@autumn/shared";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import { CreateFeature } from "@/views/features/CreateFeature";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useProductContext } from "../ProductContext";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { EntitiesDropdown } from "./EntitiesDropdown";

export const EntitiesSidebar = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { entityFeatureIds } = useProductContext();

  return (
    <>
      <EntitiesDropdown open={open} setOpen={setOpen} />
      {entityFeatureIds.length > 0 ? (
        <div className="flex justify-between gap-4 rounded-sm w-full">
          <div className="flex flex-col w-full gap-4">
            <div className="flex items-center w-full justify-between h-4 gap-2 overflow-hidden">
              <p className="text-xs text-t3 font-medium text-center">
                Features{" "}
              </p>
              <div className="relative w-full overflow-hidden">
                <div className="text-t2 cursor-default pr-2 truncate w-full text-right">
                  <span className="truncate w-full">
                    {entityFeatureIds.length === 1
                      ? entityFeatureIds[0]
                      : `${entityFeatureIds.length}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-t3">Assign product items to a sub-group</p>
      )}
    </>
  );
};
