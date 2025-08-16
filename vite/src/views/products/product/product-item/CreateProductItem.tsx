import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

import { useEffect, useState } from "react";
import {
  ProductItemContext,
  useProductItemContext,
} from "./ProductItemContext";

import {
  ProductItemInterval,
  ProductItem,
  CreateFeature as CreateFeatureType,
  FrontendProductItem,
  Infinite,
} from "@autumn/shared";

import { useProductContext } from "../ProductContext";
import { validateProductItem } from "@/utils/product/product-item/validateProductItem";
import { CreateItemDialogContent } from "./create-product-item/CreateItemDialogContent";
import { Plus } from "lucide-react";
import { useSteps } from "./useSteps";
import { CreateItemStep } from "./utils/CreateItemStep";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";
import { emptyPriceItem } from "./create-product-item/defaultItemConfigs";
import { itemsHaveSameInterval } from "@/utils/product/productItemUtils";
import { toast } from "sonner";
import { getFeature } from "@/utils/product/entitlementUtils";

export const defaultProductItem: ProductItem = {
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

const useMergeFeatureItem = ({
  item,
  setOpen,
}: {
  item: ProductItem;
  setOpen: (open: boolean) => void;
}) => {
  const { product, setProduct } = useProductContext();
  const getOtherFeaturePriceItemIndex = () => {
    return product.items.findIndex(
      (i: any) =>
        i.feature_id === item.feature_id &&
        isFeaturePriceItem(i) &&
        itemsHaveSameInterval({ item1: i, item2: item })
    );
  };

  const shouldMergeFeatureItem = () => {
    const otherItemIndex = getOtherFeaturePriceItemIndex();
    const isFeature = isFeatureItem(item);
    return isFeature && otherItemIndex !== -1;
  };

  const mergeFeatureItem = () => {
    const otherItemIndex = getOtherFeaturePriceItemIndex();
    const newItems = [...product.items];
    const newIncludedUsage = parseFloat(item.included_usage?.toString() || "0");
    if (isNaN(newIncludedUsage)) {
      toast.error("You must set an included usage for this item");
      return;
    }

    newItems[otherItemIndex] = {
      ...newItems[otherItemIndex],
      included_usage: newIncludedUsage,
    };

    setProduct({ ...product, items: newItems });
    setOpen(false);
  };

  return {
    shouldMergeFeatureItem,
    mergeFeatureItem,
  };
};

const useMergeFeaturePriceItem = ({
  item,
  setOpen,
}: {
  item: ProductItem;
  setOpen: (open: boolean) => void;
}) => {
  const { product, setProduct, features } = useProductContext();

  const getOtherFeatureItemIndex = () => {
    return product.items.findIndex(
      (i: any) =>
        i.feature_id === item.feature_id &&
        isFeatureItem(i) &&
        itemsHaveSameInterval({ item1: i, item2: item })
    );
  };

  const shouldMergeFeaturePriceItem = () => {
    const otherItemIndex = getOtherFeatureItemIndex();
    const isFeaturePrice = isFeaturePriceItem(item);
    return isFeaturePrice && otherItemIndex !== -1 && item.feature_id;
  };

  const mergeFeaturePriceItem = () => {
    const otherItemIndex = getOtherFeatureItemIndex();
    const otherItem = product.items[otherItemIndex];

    // 1. If unlimited, don't allow this item
    if (otherItem.included_usage === Infinite) {
      toast.error(
        `Cannot create a priced feature when you have another item for this feature (${otherItem.feature_id}) which is unlimited`
      );
      return;
    }

    const newItems = [...product.items];
    const newItem = validateProductItem({
      item: item as FrontendProductItem,
      features,
    });
    if (!newItem) return;

    newItems[otherItemIndex] = {
      ...newItem,
      included_usage: otherItem.included_usage,
    };

    setProduct({ ...product, items: newItems });
    setOpen(false);
  };

  return {
    shouldMergeFeaturePriceItem,
    mergeFeaturePriceItem,
  };
};

export function CreateProductItem() {
  const [open, setOpen] = useState(false);
  const [showCreateFeature, setShowCreateFeature] = useState(false);
  const [item, setItem] = useState<ProductItem>(defaultProductItem);
  const { features, product, setProduct, setFeatures, counts, mutate } =
    useProductContext();

  const [configState, setConfigState] = useState({
    showPrice: false,
  });

  const { shouldMergeFeatureItem, mergeFeatureItem } = useMergeFeatureItem({
    item,
    setOpen,
  });
  const { shouldMergeFeaturePriceItem, mergeFeaturePriceItem } =
    useMergeFeaturePriceItem({
      item,
      setOpen,
    });

  const warning = () => {
    if (shouldMergeFeatureItem() && item.feature_id) {
      const feature = getFeature(item.feature_id, features);
      return `You already have a usage-based price for ${feature?.name}. Adding this feature will merge it with that price, and create an overage price (eg 100 free, then $0.5 thereafter)`;
    }

    if (shouldMergeFeaturePriceItem() && item.feature_id) {
      const feature = getFeature(item.feature_id, features);
      return `You already have a feature item for ${feature?.name}. Adding a variable price will merge it with that item, and create an overage price (eg 100 free, then $0.5 thereafter)`;
    }

    return null;
  };

  const handleCreateProductItem = async (entityFeatureId?: string) => {
    if (shouldMergeFeatureItem()) {
      mergeFeatureItem();
      return;
    }

    if (shouldMergeFeaturePriceItem()) {
      mergeFeaturePriceItem();
      return;
    }

    const validatedItem = validateProductItem({
      item: {
        ...(item as FrontendProductItem),
        entity_feature_id: entityFeatureId
          ? entityFeatureId
          : item.entity_feature_id,
      },
      features,
    });

    if (!validatedItem) return;

    const newItems = [...product.items, validatedItem];
    setProduct({ ...product, items: newItems });

    setOpen(false);
  };

  const stepState = useSteps({
    initialStep: CreateItemStep.CreateItem,
  });

  return (
    <ProductItemContext.Provider
      value={{
        item,
        setItem,
        showCreateFeature,
        setShowCreateFeature,
        isUpdate: false,
        handleCreateProductItem,
        stepState,
        setOpen,
        warning: warning(),
      }}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex gap-0">
          <DialogTrigger asChild>
            <Button
              className="w-24"
              variant="add"
              onClick={() => setItem(defaultProductItem)}
              startIcon={<Plus size={14} />}
            >
              Feature
            </Button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <Button
              className="w-24"
              variant="add"
              onClick={() => setItem(emptyPriceItem)}
              startIcon={<Plus size={14} />}
            >
              Price
            </Button>
          </DialogTrigger>
        </div>
        <CreateItemDialogContent open={open} setOpen={setOpen} />
      </Dialog>
    </ProductItemContext.Provider>
  );
}
