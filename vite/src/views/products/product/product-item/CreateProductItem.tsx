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
import { toast } from "sonner";
import { invalidNumber } from "@/utils/genUtils";

export let defaultProductItem: ProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,
  reset_usage_on_interval: true,

  // Price config
  amount: null,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  carry_over_usage: false,
};

let defaultPriceItem: ProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,
  reset_usage_on_interval: true,

  // Price config
  amount: 0,
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

  const handleCreateProductItem = (show: any) => {
    const validatedItem = validateProductItem(item, show);
    if (!validatedItem) return;
    setProduct({ ...product, items: [...product.items, validatedItem] });
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
            className="w-full text-primary hover:text-primary/80"
            onClick={() => setItem(defaultProductItem)}
          >
            Feature
          </Button>
        </DialogTrigger>
        <DialogTrigger asChild>
          <Button
            startIcon={<PlusIcon size={15} />}
            variant="ghost"
            className="w-full text-primary hover:text-primary/80"
            onClick={() => setItem(defaultPriceItem)}
          >
            Price
          </Button>
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
              <DialogTitle>Add Product Item</DialogTitle>
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

export const validateProductItem = (item: ProductItem, show: any) => {
  // Basic validation for all product items
  // if (!item.feature_id) {
  //   toast.error("Please select a feature");
  //   return null;
  // }

  // if (!item.interval) {
  //   toast.error("Please select a billing interval");
  //   return null;
  // }

  // Price item validation (when amount is set)
  if (item.amount !== null) {
    if (invalidNumber(item.amount)) {
      toast.error("Please enter a valid price amount");
      return null;
    }
    // item.amount = parseFloat(item.amount.toString());
  }

  if (item.included_usage !== null) {
    let usageNumber = Number(item.included_usage);
    if (invalidNumber(usageNumber) || usageNumber < 0) {
      toast.error("Please enter a valid included usage amount");
      return null;
    }
    item.included_usage = usageNumber;
  }

  // Usage/Feature item validation (when tiers are set)
  if (item.tiers) {
    let previousTo = 0; // Track the previous tier's 'to' value

    for (let i = 0; i < item.tiers.length; i++) {
      const tier = item.tiers[i];

      // Check if amount is valid
      if (invalidNumber(tier.amount)) {
        toast.error("Please enter valid prices for all tiers");
        return null;
      }

      // Check if 'to' is valid (except for the last tier which can be -1)
      if (invalidNumber(tier.to) && tier.to !== "inf") {
        toast.error("Please enter valid usage limits for all tiers");
        return null;
      }

      // Ensure tiers are in ascending order
      const toValue =
        typeof tier.to === "number" ? tier.to : parseFloat(tier.to);
      const amountValue =
        typeof tier.amount === "number" ? tier.amount : parseFloat(tier.amount);

      if (tier.to !== "inf" && toValue <= previousTo) {
        toast.error("Tiers must be in ascending order");
        return null;
      }

      if (tier.to !== "inf") {
        previousTo = toValue;
      }

      item.tiers[i].to = toValue;
      item.tiers[i].amount = amountValue;
    }
  }

  // Validate billing units
  if (item.billing_units && invalidNumber(item.billing_units)) {
    toast.error("Please enter valid billing units");
    return null;
  }

  return item;
};
