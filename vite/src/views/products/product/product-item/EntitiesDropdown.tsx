import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Feature,
  features,
  FeatureUsageType,
  ProductItem,
} from "@autumn/shared";
import { useState } from "react";
import { useProductContext } from "../ProductContext";
import { CheckIcon, PlusIcon } from "lucide-react";
import { CreateFeature } from "@/views/products/features/components/CreateFeature";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CustomDialogContent } from "@/components/general/modal-components/DialogContentWrapper";

export const EntitiesDropdown = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <div className={cn("absolute right-4")}></div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={-10}
        className="max-w-52"
      >
        <EntitiesDropdownContent />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const EntitiesDropdownContent = () => {
  const { product, features, entityFeatureIds, setEntityFeatureIds } =
    useProductContext();
  const [createFeatureOpen, setCreateFeatureOpen] = useState(false);

  const continuousUseFeatures = features.filter(
    (feature: Feature) =>
      feature.config?.usage_type === FeatureUsageType.Continuous
  );

  return (
    <>
      {continuousUseFeatures.map((item: Feature, index: number) => (
        <DropdownMenuItem
          key={index}
          onSelect={() => {
            setEntityFeatureIds((prev: any) => {
              const currentIds = Array.isArray(prev) ? prev : [];
              if (currentIds.includes(item.id)) {
                // Check if any product items are using this entity
                const itemsUsingEntity =
                  product.items?.filter(
                    (productItem: ProductItem) =>
                      productItem.entity_feature_id === item.id
                  ) || [];

                if (itemsUsingEntity.length > 0) {
                  toast.error(
                    "Please delete all items under this entity first"
                  );
                  return currentIds;
                }

                return currentIds.filter((id) => id !== item.id);
              } else {
                return [...currentIds, item.id];
              }
            });
          }}
        >
          <div className="flex items-center gap-2 truncate">
            <span className="truncate">{item.name}</span>
            {entityFeatureIds.includes(item.id) && (
              <div className="w-3 h-3 min-w-3 min-h-3 bg-lime-500 rounded-full flex items-center justify-center">
                <CheckIcon className="w-2 h-2 text-white" />
              </div>
            )}
          </div>
        </DropdownMenuItem>
      ))}
      <Dialog open={createFeatureOpen} onOpenChange={setCreateFeatureOpen}>
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <Button
              variant="ghost"
              startIcon={<PlusIcon size={12} />}
              className="w-full  p-0 h-auto font-normal text-primary"
            >
              Create Feature Entity
            </Button>
          </DropdownMenuItem>
        </DialogTrigger>
        <CustomDialogContent>
          <CreateFeature
            setOpen={setCreateFeatureOpen}
            open={createFeatureOpen}
            entityCreate={true}
          />
        </CustomDialogContent>
      </Dialog>
    </>
  );
};
