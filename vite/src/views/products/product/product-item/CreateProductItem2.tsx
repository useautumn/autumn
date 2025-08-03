import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useEffect, useState } from "react";
import { ProductItemConfig } from "./ProductItemConfig";
import { ProductItemContext } from "./ProductItemContext";
import { CreateFeature } from "@/views/features/CreateFeature";

import {
  ProductItemInterval,
  ProductItem,
  CreateFeature as CreateFeatureType,
} from "@autumn/shared";

import { useProductContext } from "../ProductContext";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import { DialogContentWrapper } from "@/components/general/modal-components/DialogContentWrapper";
import { ItemConfigFooter } from "./product-item-config/item-config-footer/ItemConfigFooter";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { PlusIcon } from "lucide-react";
import { CreateItemDialogContent } from "./create-product-item/CreateItemDialogContent";
import { useModelPricingContext } from "@/views/onboarding2/model-pricing/ModelPricingContext";

const defaultProductItem: ProductItem = {
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

export function CreateProductItem2() {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<ProductItem>(defaultProductItem);
  const { features, product, setProduct, setFeatures } = useProductContext();
  const { firstItemCreated, setFirstItemCreated } = useModelPricingContext();

  const handleCreateProductItem = async (entityFeatureId?: string) => {
    const validatedItem = validateProductItem({
      item: {
        ...item,
        entity_feature_id: entityFeatureId
          ? entityFeatureId
          : item.entity_feature_id,
      },
      features,
    });

    if (!validatedItem) return;

    const newItems = [...product.items, validatedItem];
    const newProduct = { ...product, items: newItems };
    setProduct(newProduct);
    setTimeout(() => {
      setItem({
        ...defaultProductItem,
        feature_id: null,
      });
    }, 400);

    setOpen(false);
    setFirstItemCreated(true);
    return newProduct;
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
        features,
        setFeatures,
        open,
        setOpen,
        autoSave: true,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex gap-0">
          <DialogTrigger asChild>
            <Button
              variant="dashed"
              className="w-full"
              startIcon={<PlusIcon size={14} />}
            >
              Add Product Item
            </Button>
          </DialogTrigger>
        </div>
        <CreateItemDialogContent open={open} setOpen={setOpen} />
      </Dialog>
    </ProductItemContext.Provider>
  );
}
