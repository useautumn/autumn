import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

import { useState } from "react";
import { ProductItemContext } from "./ProductItemContext";

import {
  ProductItemInterval,
  ProductItem,
  CreateFeature as CreateFeatureType,
} from "@autumn/shared";

import { useProductContext } from "../ProductContext";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import { PlusIcon } from "lucide-react";
import { CreateItemDialogContent } from "./create-product-item/CreateItemDialogContent";
import { useModelPricingContext } from "@/views/onboarding2/model-pricing/ModelPricingContext";
import { useSteps } from "./useSteps";
import { CreateItemStep } from "./utils/CreateItemStep";
import { cn } from "@/lib/utils";
import { defaultPriceItem } from "./create-product-item/defaultItemConfigs";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

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

export function CreateProductItem2({
  classNames,
}: {
  classNames?: {
    button?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<ProductItem>(defaultProductItem);
  const { product, setProduct } = useProductContext();
  const { features } = useFeaturesQuery();

  const stepState = useSteps({ initialStep: CreateItemStep.SelectItemType });

  const handleCreateProductItem = async (entityFeatureId?: string) => {
    const validatedItem = validateProductItem({
      item: {
        isPrice: false,
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
    // setFirstItemCreated(true);
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

        open,
        setOpen,
        autoSave: true,
        stepState,
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex gap-2 max-w-md">
          <DialogTrigger asChild>
            <Button
              variant="dashed"
              className={cn("w-full", classNames?.button)}
              startIcon={<PlusIcon size={14} />}
              onClick={() => setItem(defaultProductItem)}
            >
              Add Feature
            </Button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <Button
              variant="dashed"
              className={cn("w-full", classNames?.button)}
              startIcon={<PlusIcon size={14} />}
              onClick={() => setItem(defaultPriceItem)}
            >
              Add Price
            </Button>
          </DialogTrigger>
        </div>
        <CreateItemDialogContent open={open} setOpen={setOpen} />
      </Dialog>
    </ProductItemContext.Provider>
  );
}
