import { useProductItemContext } from "../ProductItemContext";
import { BillingInterval, FeatureUsageType, Infinite } from "@autumn/shared";
import { SelectCycle } from "./components/feature-price/SelectBillingCycle";
import { IncludedUsage } from "./components/IncludedUsage";
import { SelectResetCycle } from "./components/SelectResetCycle";
import FeaturePrice from "./components/feature-price/FeaturePrice";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";
import React from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { PrepaidToggle } from "./components/feature-price/PrepaidToggle";
import { AdvancedItemConfig } from "./advanced-config/AdvancedItemConfig";
import { notNullish } from "@/utils/genUtils";
import {
  getFeature,
  getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductContext } from "../../ProductContext";

export const FeatureConfig = () => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  if (!item.feature_id) return null;

  const isFeaturePrice = isFeaturePriceItem(item);
  const isFeature = isFeatureItem(item);

  const handleAddUsagePrice = () => {
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
      tiers: [{ to: Infinite, amount: 0 }],
      interval: newInterval,
    });
  };

  const price =
    getFeatureUsageType({ item, features }) == FeatureUsageType.Continuous
      ? "10"
      : "1";

  const feature = getFeature(item?.feature_id, features);

  return (
    <>
      <div className="flex items-center gap-2 w-full">
        <IncludedUsage />
        <SelectResetCycle />
      </div>

      {isFeaturePrice && (
        <React.Fragment>
          <div className="transition-all duration-300 ease-in-out whitespace-nowrap">
            <div className="flex gap-6 flex-2">
              <FeaturePrice />
            </div>
          </div>

          <div className="flex gap-2">
            <SelectCycle />
            <PrepaidToggle />
          </div>

          {/* <ProrationConfig /> */}
        </React.Fragment>
      )}

      {isFeature && (
        <div>
          <p className="text-t3 mb-2">
            If you want to charge for usage of this feature (eg. ${price} per{" "}
            {feature?.display?.singular ?? feature?.name ?? "feature"})
          </p>
          <div className="flex w-full justify-start transition-all duration-300 ease-in-out overflow-hidden">
            <Button
              variant="outline"
              className="w-full !border-dashed bg-transparent text-t2"
              startIcon={<PlusIcon size={12} />}
              onClick={handleAddUsagePrice}
            >
              Add Price
            </Button>
          </div>
        </div>
      )}
      <AdvancedItemConfig />
    </>
  );
};
