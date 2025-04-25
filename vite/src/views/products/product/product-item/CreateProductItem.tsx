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
import {
  Feature,
  ProductItemInterval,
  ProductItem,
  ProductItemFeatureType,
} from "@autumn/shared";
import { useProductContext } from "../ProductContext";

import { validateProductItem } from "@/utils/product/product-item/validateProductItem";

export let defaultProductItem: ProductItem = {
  feature_id: null,

  included_usage: null,

  interval: ProductItemInterval.Month,

  // Price config
  price: null,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

let defaultPriceItem: ProductItem = {
  feature_id: null,
  included_usage: null,

  interval: ProductItemInterval.Month,

  // Price config
  price: 0,
  tiers: null,
  billing_units: 1,

  // Others
  entity_feature_id: null,
  reset_usage_when_enabled: true,
};

export function CreateProductItem() {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<ProductItem>(defaultProductItem);
  const { features, product, setProduct, setFeatures } = useProductContext();

  const setSelectedFeature = (feature: Feature) => {
    console.log("Setting selected feature", feature);
    setFeatures([...features, feature]);
    console.log("Made it here");
    setItem({ ...item, feature_id: feature.id! });
  };

  const handleCreateProductItem = (show: any) => {
    const validatedItem = validateProductItem({ item, show, features });
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
