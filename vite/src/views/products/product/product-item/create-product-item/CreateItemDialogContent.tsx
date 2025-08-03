import { DialogContentWrapper } from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProductItemContext } from "../ProductItemContext";
import { CreateFeature } from "@/views/features/CreateFeature";
import { ProductItemConfig } from "../ProductItemConfig";
import {
  ProductItemInterval,
  ProductItem,
  CreateFeature as CreateFeatureType,
  ProductItemType,
  Infinite,
  FeatureType,
  BillingInterval,
} from "@autumn/shared";
import { ItemConfigFooter } from "../product-item-config/item-config-footer/ItemConfigFooter";
import { CreateFeatureFromItem } from "./CreateFeatureFromItem";
import { useEffect, useState } from "react";
import { useProductContext } from "../../ProductContext";
import { CreateItemIntro } from "./CreateItemIntro";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getItemType } from "@/utils/product/productItemUtils";
import { getFeature } from "@/utils/product/entitlementUtils";
import { defaultPaidFeatureItem, defaultPriceItem } from "./defaultItemConfigs";
import { notNullish } from "@/utils/genUtils";

export const CreateItemDialogContent = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const {
    showCreateFeature,
    setShowCreateFeature,
    features,
    item,
    setItem,
    setFeatures,
  } = useProductItemContext();

  const { product } = useProductContext();

  const [showIntro, setShowIntro] = useState(product.items.length === 0);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (open) {
      setShowIntro(product.items.length === 0);
      setIntroDone(false);
    }
  }, [open]);

  const showFeatureDialog =
    showCreateFeature || (features.length == 0 && item.price === null);

  const showIntroDialog = !introDone;

  const getTabValue = () => {
    return getItemType(item);
  };

  const handleTabChange = (value: string) => {
    if (value === ProductItemType.Feature) {
      setItem({
        ...item,
        feature_id: item.feature_id,
        price: null,
        tiers: null,
      });
    }

    if (value === ProductItemType.FeaturePrice) {
      const feature = getFeature(item.feature_id, features);
      if (!feature || feature?.type === FeatureType.Boolean) {
        setItem(defaultPaidFeatureItem);
      } else {
        const newIncludedUsage =
          item.included_usage == Infinite ? 0 : item.included_usage;

        let newInterval = item.interval;
        if (
          notNullish(item.interval) &&
          !Object.values(BillingInterval).includes(item.interval)
        ) {
          newInterval = BillingInterval.Month;
        }

        setItem({
          ...item,
          included_usage: newIncludedUsage,
          interval: newInterval,
          tiers: [{ to: Infinite, amount: 0 }],
        });
      }
    }

    if (value === ProductItemType.Price) {
      setItem(defaultPriceItem);
    }
  };

  const tabTriggerClass =
    "data-[state=active]:bg-stone-200 data-[state=active]:text-t2 data-[state=active]:font-medium";
  return (
    <DialogContent className="translate-y-[0%] top-[20%] flex flex-col gap-0 w-fit p-0">
      <DialogContentWrapper>
        {showIntroDialog ? (
          <CreateItemIntro setIntroDone={setIntroDone} />
        ) : showFeatureDialog ? (
          <CreateFeatureFromItem />
        ) : (
          <div className="flex flex-col gap-4">
            <DialogHeader className="p-0">
              <DialogTitle>Add Product Item</DialogTitle>
            </DialogHeader>

            <Tabs value={getTabValue()} onValueChange={handleTabChange}>
              <TabsList className="gap-2">
                <TabsTrigger className={tabTriggerClass} value="feature">
                  Feature
                </TabsTrigger>
                <TabsTrigger className={tabTriggerClass} value="priced_feature">
                  Priced Feature
                </TabsTrigger>
                <TabsTrigger className={tabTriggerClass} value="price">
                  Price
                </TabsTrigger>
              </TabsList>
              <TabsContent value="config">
                <ProductItemConfig />
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-4 w-fit !overflow-visible">
              <ProductItemConfig />
            </div>
          </div>
        )}
      </DialogContentWrapper>
      {!showIntroDialog && !showFeatureDialog && (
        <ItemConfigFooter setIntroDone={setIntroDone} />
      )}
    </DialogContent>
  );
};
