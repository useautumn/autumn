import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { ProductItemContext } from "./ProductItemContext";
import { CreateFeature } from "@/views/features/CreateFeature";
import {
  Feature,
  ProductItemInterval,
  CreateProductItem as CreateProductItemType,
} from "@autumn/shared";
import { useProductContext } from "../ProductContext";

let defaultProductItem: CreateProductItemType = {
  feature_id: "",
  included_usage: 0,
  interval: ProductItemInterval.Month,
  reset_usage_on_interval: false,

  // Price config
  amount: 0,
  tiers: [],
  billing_units: 0,

  // Others
  entity_feature_id: null,
  carry_over_usage: false,
};

export const CreateProductItem = () => {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<CreateProductItemType>(defaultProductItem);
  const { features } = useProductContext();

  const setSelectedFeature = (feature: Feature) => {
    setItem({ ...item, feature_id: feature.id! });
  };

  return (
    <ProductItemContext.Provider
      value={{
        item,
        setItem,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: false,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            startIcon={<PlusIcon size={15} />}
            // variant={buttonType ? "ghost" : "dashed"}
            className={cn(
              "w-full"
              // buttonType && "!w-24 text-primary h-full justify-start"
            )}
            onClick={() => {
              // setSelectedFeature(null);
              // setEntitlement(null);
              // setPriceConfig(getDefaultPriceConfig(PriceType.Usage));
            }}
          >
            Product Item
          </Button>
        </DialogTrigger>
        <DialogContent
          className={cn("translate-y-[0%] top-[20%] flex flex-col gap-4 w-fit")}
        >
          <DialogHeader>
            <div className="flex flex-col">
              {showCreateFeature && (
                <Button
                  variant="ghost"
                  className="text-xs py-0 px-2 w-fit -ml-5 -mt-7 hover:bg-transparent"
                  onClick={() => setShowCreateFeature(false)}
                >
                  ← Product
                </Button>
              )}
              <DialogTitle>Add Feature</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex overflow-hidden w-fit">
            {showCreateFeature ? (
              <div className="w-full">
                <CreateFeature
                  isFromEntitlement={true}
                  setShowFeatureCreate={setShowCreateFeature}
                  setSelectedFeature={setSelectedFeature}
                  setOpen={setOpen}
                  open={open}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-fit">
                <ProductItemConfig />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProductItemContext.Provider>
  );
};
