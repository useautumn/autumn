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
import { Feature, ProductItemInterval, ProductItem } from "@autumn/shared";
import { useProductContext } from "../ProductContext";

let defaultProductItem: ProductItem = {
  feature_id: null,
  included_usage: 0,

  interval: ProductItemInterval.Month,
  reset_usage_on_interval: false,

  // Price config
  amount: null,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  carry_over_usage: false,
};

export function CreateProductItem() {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<ProductItem>(defaultProductItem);
  const { features, product, setProduct } = useProductContext();

  const setSelectedFeature = (feature: Feature) => {
    setItem({ ...item, feature_id: feature.id! });
  };

  const handleCreateProductItem = () => {
    // Add to product
    setProduct({ ...product, items: [...product.items, item] });
    setOpen(false);
  };

  return (
    <ProductItemContext.Provider
      value={{
        item,
        setItem,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: false,
        handleCreateProductItem,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            startIcon={<PlusIcon size={15} />}
            variant="ghost"
            className="w-full text-primary text-xs hover:text-primary/80"
            onClick={() => setItem(defaultProductItem)}
          ></Button>
        </DialogTrigger>
        <DialogContent
          className={cn(
            "translate-y-[0%] top-[20%] flex flex-col gap-4 w-fit overflow-visible"
          )}
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
          <div className="flex overflow-visible w-fit">
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
}
