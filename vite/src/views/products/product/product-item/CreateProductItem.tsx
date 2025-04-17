import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  reset_usage_on_billing: true,

  // Price config
  price: null,
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
  reset_usage_on_billing: true,

  // Price config
  price: 0,
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
  const { features, product, setProduct, setFeatures } = useProductContext();

  console.log(item);

  const setSelectedFeature = (feature: Feature) => {
    setFeatures([...features, feature]);
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
        <div className="flex gap-0">
          <DialogTrigger asChild>
            <Button
              variant="add"
              className="w-full w-24"
              onClick={() => setItem(defaultProductItem)}
            >
              Feature
            </Button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <Button
              variant="add"
              className="w-24 border-l-0"
              onClick={() => setItem(defaultPriceItem)}
            >
              Price
            </Button>
          </DialogTrigger>
        </div>
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
                  className="text-xs py-0 px-2 w-fit -ml-5 -mt-5 hover:bg-transparent"
                  onClick={() => setShowCreateFeature(false)}
                >
                  ← Product
                </Button>
              )}
              <DialogTitle>Add Product Item</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex overflow-visible w-fit">
            {showCreateFeature ||
            (features.length == 0 && item.price === null) ? (
              <div className="w-full -mt-2">
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
  // Price item validation (when amount is set)
  if (item.price !== null && show.price) {
    if (invalidNumber(item.price)) {
      toast.error("Please enter a valid price amount");
      return null;
    }
    item.price = parseFloat(item.price!.toString());
  }

  if ((item.included_usage as any) === "") {
    item.included_usage = null;
  } else if (!invalidNumber(item.included_usage)) {
    item.included_usage = Number(item.included_usage);
  }

  //if both item.tiers and item.price are set, set item.price to null
  if (item.tiers && item.price) {
    item.price = null;
  }

  // Usage/Feature item validation (when tiers are set)
  if (item.tiers) {
    let previousTo = 0;

    for (let i = 0; i < item.tiers.length; i++) {
      const tier = item.tiers[i];

      // Check if amount is actually a number
      if (typeof tier.amount !== "number") {
        tier.amount = parseFloat(tier.amount);
      }

      // Check if amount is valid
      if (invalidNumber(tier.amount)) {
        toast.error("Please enter valid prices for all tiers");
        return null;
      }

      // Check if amount is negative
      if (tier.amount < 0) {
        toast.error("Please set a positive usage price");
        return null;
      }

      // Skip other validations if 'to' is "inf"
      if (tier.to === "inf") {
        continue;
      }

      tier.to = Number(tier.to);

      // Check if 'to' is a number and valid
      if (typeof tier.to !== "number" || invalidNumber(tier.to)) {
        toast.error("Please enter valid usage limits for all tiers");
        return null;
      }

      // Ensure tiers are in ascending order
      if (tier.to <= previousTo) {
        toast.error("Tiers must be in ascending order");
        return null;
      }

      previousTo = tier.to;
    }
  }

  // Validate billing units
  if (item.billing_units && invalidNumber(item.billing_units)) {
    toast.error("Please enter valid billing units");
    return null;
  } else {
    item.billing_units = Number(item.billing_units);
  }

  return item;
};
