import {
  Feature,
  FeatureType,
  FeatureUsageType,
  ProductItemFeatureType,
  ProductItemInterval,
  TierInfinite,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";

import { cn } from "@/lib/utils";
import { useProductItemContext } from "./ProductItemContext";
import {
  getShowParams,
  shouldShowProrationConfig,
} from "@/utils/product/productItemUtils";
import { ConfigWithFeature } from "./components/ConfigWithFeature";
import FixedPriceConfig from "./components/ConfigFixedPrice";
import { isFeaturePriceItem, isPriceItem } from "@/utils/product/getItemType";

export const ProductItemConfig = () => {
  // HOOKS
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();
  const [show, setShow] = useState(getShowParams(item));

  const handleAddPrice = () => {
    setItem({
      ...item,
      tiers: [
        {
          to: TierInfinite,
          amount: item.price ?? 0,
        },
      ],
      interval: ProductItemInterval.Month,
    });
    setShow({ ...show, price: !show.price });
  };

  useEffect(() => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);

    if (feature) {
      if (feature.type == FeatureType.Boolean) {
        setItem({
          feature_id: item.feature_id,
          feature_type: ProductItemFeatureType.Static,
        });
      } else {
        const showProration = shouldShowProrationConfig({ item, features });
        const resetUsageWhenEnabled =
          feature.config?.usage_type == FeatureUsageType.Continuous
            ? false
            : item.reset_usage_when_enabled;

        const newItem = {
          ...item,
          feature_type: feature.config?.usage_type,
          reset_usage_when_enabled: resetUsageWhenEnabled,
        };

        // Only manage proration config if this item should show proration
        if (showProration) {
          // Preserve existing config and manage proration parts
          const existingConfig = item.config || {};
          const newConfig = {
            ...existingConfig,
            on_increase: existingConfig.on_increase,
            on_decrease: existingConfig.on_decrease,
          };

          if (Object.keys(newConfig).length > 0) {
            newItem.config = newConfig;
          }
        }
        // If showProration is false, don't touch the config at all - preserve whatever is there

        setItem(newItem);
      }
    }
  }, [item.feature_id, item.usage_model]);

  const isPrice = isPriceItem(item);

  return (
    <div
      className={cn(
        "flex flex-col gap-6 w-md transition-all ease-in-out duration-300 !overflow-visible", //modal animations
        isPriceItem(item) && "w-xs",
        isFeaturePriceItem(item) && "w-md",
        isFeaturePriceItem(item) && item.tiers?.length > 1 && "w-md"
      )}
    >
      {isPrice ? (
        <FixedPriceConfig show={show} setShow={setShow} />
      ) : (
        <ConfigWithFeature
          show={show}
          setShow={setShow}
          handleAddPrice={handleAddPrice}
        />
      )}
    </div>
  );
};
