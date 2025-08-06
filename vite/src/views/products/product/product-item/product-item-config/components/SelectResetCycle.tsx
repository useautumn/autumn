import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Select } from "@/components/ui/select";
import { useProductItemContext } from "../../ProductItemContext";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { EntInterval, FeatureUsageType, Infinite } from "@autumn/shared";
import { itemToEntInterval } from "@/utils/product/itemIntervalUtils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { getFeatureUsageType } from "@/utils/product/entitlementUtils";
import { useProductContext } from "../../../ProductContext";
import { Button } from "@/components/ui/button";
import { ArrowUp01, PlusIcon } from "lucide-react";

export const SelectResetCycle = () => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  const handleChange = (value: EntInterval) => {
    setItem({
      ...item,
      interval: value == EntInterval.Lifetime ? null : (value as EntInterval),
    });
  };

  const isFeaturePrice = isFeaturePriceItem(item);
  const usageType = getFeatureUsageType({ item, features });

  if (usageType === FeatureUsageType.Continuous) {
    return null;
  }

  const interval = itemToEntInterval(item);

  const getIntervalText = (interval: EntInterval) => {
    return interval === "semi_annual"
      ? "per half year"
      : interval === "lifetime"
        ? "no reset"
        : `per ${interval}`;
  };
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        isFeaturePrice ? "w-0 overflow-hidden" : "w-60"
      )}
    >
      <FieldLabel className="flex items-center gap-2">
        <span className="whitespace-nowrap truncate">Reset Interval</span>
        <InfoTooltip>
          <span className="">
            How often usage counts reset for this feature. Choose "no reset" for
            items that don't expire.
          </span>
        </InfoTooltip>
      </FieldLabel>
      <Select
        disabled={item.included_usage == Infinite}
        value={itemToEntInterval(item) as string}
        onValueChange={(value) => {
          handleChange(value as EntInterval);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select reset">
            {getIntervalText(interval)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.values(EntInterval).map((interval) => {
            return (
              <SelectItem
                key={interval}
                value={interval}
                className="group flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2 w-full">
                  {getIntervalText(interval)}
                  {/* <Button
                    variant="ghost"
                    size="icon"
                    className="invisible group-hover:visible h-6 border"
                  >
                    <ArrowUp01 size={12} />
                  </Button> */}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
