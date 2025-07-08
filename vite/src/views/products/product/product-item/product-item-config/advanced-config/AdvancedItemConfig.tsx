import { useProductContext } from "@/views/products/product/ProductContext";
import { useProductItemContext } from "../../ProductItemContext";
import { useState } from "react";
import { ChevronRight, PlusIcon } from "lucide-react";
import { ToggleButton } from "@/components/general/ToggleButton";
import { OnDecreaseSelect } from "./proration-config/OnDecreaseSelect";
import { OnIncreaseSelect } from "./proration-config/OnIncreaseSelect";
import { shouldShowProrationConfig } from "@/utils/product/productItemUtils";
import {
  getFeature,
  getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { FeatureUsageType } from "@autumn/shared";
import { Input } from "@/components/ui/input";

export const AdvancedItemConfig = () => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();
  const [isOpen, setIsOpen] = useState(item.usage_limit != null);

  const showProrationConfig = shouldShowProrationConfig({ item, features });
  const usageType = getFeatureUsageType({ item, features });

  return (
    <div className="w-full h-fit">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 w-fit rounded-md text-t3 hover:text-zinc-800 transition-all duration-150 ease-out mt-1"
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform duration-150 ease-out ${
            isOpen ? "rotate-90" : "rotate-0"
          }`}
        />
        <span className="text-sm font-medium">Advanced</span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-150 ease-out ${
          isOpen ? "max-h-60 opacity-100 mt-2" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-4 p-4 bg-stone-100">
          <ToggleButton
            value={item.reset_usage_when_enabled}
            setValue={() => {
              setItem({
                ...item,
                reset_usage_when_enabled: !item.reset_usage_when_enabled,
              });
            }}
            buttonText="Reset usage when enabled"
            className="text-t3 h-fit"
            disabled={usageType === FeatureUsageType.Continuous}
          />

        <div className="relative flex flex-row items-center justify-between gap-3 min-h-[35px]">
          <ToggleButton
              value={item.usage_limit != null}
              setValue={() => {
                let usage_limit;
                if (item.usage_limit) {
                  usage_limit = null;
                } else {
                  usage_limit = Infinity;
                }
                setItem({
                  ...item,
                  usage_limit: usage_limit,
                });
              }}
              buttonText="Enable usage limits"
              className="text-t3 h-fit"
            />

              {item.usage_limit != null && (
                <Input
                  type="number"
                  value={item.usage_limit || ""}
                  className="ml-5"
                  onChange={(e) => {
                    setItem({
                      ...item,
                      usage_limit: parseInt(e.target.value),
                    });
                  }}
                  placeholder="Enter usage limit"
                />
              )}
            </div>
        

          {showProrationConfig && (
            <>
              <OnIncreaseSelect />
              <OnDecreaseSelect />
            </>
          )}
          {/* <div className="flex flex-col gap-2"></div>
          <div className="flex gap-2"></div> */}

          
        </div>
      </div>
    </div>
  );
};
