import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Select } from "@/components/ui/select";
import { useProductItemContext } from "../../ProductItemContext";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";
import { EntInterval, FeatureUsageType, Infinite } from "@autumn/shared";
import { itemToEntInterval } from "@/utils/product/itemIntervalUtils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { getFeatureUsageType } from "@/utils/product/entitlementUtils";
import { useProductContext } from "../../../ProductContext";

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

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        isFeaturePrice ? "w-0 overflow-hidden" : "w-40",
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
          <SelectValue placeholder="Select reset" />
        </SelectTrigger>
        <SelectContent>
          {Object.values(EntInterval).map((interval) => (
            <SelectItem key={interval} value={interval}>
              {interval === "semi_annual"
                ? "per half year"
                : interval === "lifetime"
                  ? "no reset"
                  : `per ${interval}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
