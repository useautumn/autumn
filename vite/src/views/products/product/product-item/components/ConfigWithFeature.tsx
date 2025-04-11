import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { SelectItemFeature } from "./SelectItemFeature";
import { cn } from "@/lib/utils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useProductItemContext } from "../ProductItemContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import TieredPrice from "../TieredPrice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductContext } from "../../ProductContext";
import { Feature, FeatureType } from "@autumn/shared";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { SelectCycle } from "./SelectCycle";

export const ConfigWithFeature = ({
  show,
  setShow,
}: {
  show: any;
  setShow: (show: any) => void;
}) => {
  let { features } = useProductContext();
  let { item, setItem } = useProductItemContext();

  return (
    <div className="flex flex-col gap-4 w-full overflow-hidden">
      {/* 1. Select or create feature */}
      <SelectItemFeature />

      {/* If selected feature is not a boolean */}
      <div className="flex flex-col text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-6">
            {!show.allowance && (
              <ToggleDisplayButton
                label="Allowance"
                show={show.allowance}
                onClick={() => setShow({ ...show, allowance: !show.allowance })}
                className="text-sm animate-in fade-in fade-out duration-400"
              >
                {/* <PlusIcon className="w-4 h-4 text-t3" /> */}
                Included Usage
              </ToggleDisplayButton>
            )}

            <div
              className={cn(
                "transition-all duration-300 ease-in-out opacity-0",
                show.allowance
                  ? "flex flex-col opacity-100 max-w-screen duration-600"
                  : "max-w-0 overflow-hidden"
              )}
            >
              <FieldLabel className="flex items-center gap-2">
                {/* {showPrice ? "Pricing" : "Included Usage"} */}
                Included Usage
                <Tooltip delayDuration={400}>
                  <TooltipTrigger asChild>
                    <InfoIcon className="w-3 h-3 text-t3/50" />
                  </TooltipTrigger>
                  <TooltipContent sideOffset={5} side="top">
                    How much usage of this feature is included as part of this
                    plan
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <div className="flex w-full h-fit gap-2">
                <Input
                  placeholder="eg. 100"
                  className=""
                  disabled={item.included_usage == "unlimited"}
                  value={item.included_usage}
                  type={item.included_usage === "unlimited" ? "text" : "number"}
                  onChange={(e) => {
                    setItem({
                      ...item,
                      included_usage: Number(e.target.value),
                    });
                  }}
                />
                <ToggleDisplayButton
                  label="Unlimited"
                  show={item.included_usage == "unlimited"}
                  className="h-8"
                  onClick={() => {
                    setShow({ ...show, price: false });
                    if (itemIsUnlimited(item)) {
                      setItem({
                        ...item,
                        included_usage: 0,
                      });
                    } else {
                      setItem({
                        ...item,
                        included_usage: "unlimited",
                      });
                    }
                  }}
                >
                  ♾️
                </ToggleDisplayButton>
                {show.allowance && (
                  <Button
                    isIcon
                    size="sm"
                    variant="ghost"
                    className="w-fit text-t3"
                    onClick={() => setShow({ ...show, allowance: false })}
                  >
                    <X size={12} className="text-t3" />
                  </Button>
                )}
              </div>
            </div>

            {show.price && (
              <div className="flex flex-col">
                <FieldLabel className="flex items-center gap-2">
                  Pricing
                </FieldLabel>
                <TieredPrice
                  setShowPrice={(val: boolean) =>
                    setShow({ ...show, price: val })
                  }
                />
              </div>
            )}

            {(show.perEntity || show.cycle || show.price) && (
              <div className="flex gap-2 transition-all duration-200 ease-in-out animate-in fade-in fade-out">
                {show.perEntity && (
                  <div className="flex flex-col w-full overflow-hidden">
                    <FieldLabel className="flex items-center gap-2">
                      Entity
                      <Tooltip delayDuration={400}>
                        <TooltipTrigger asChild>
                          <InfoIcon className="w-3 h-3 text-t3/50" />
                        </TooltipTrigger>
                        <TooltipContent sideOffset={5} side="top">
                          An entity (eg, a user) within the customer to assign
                          this entitlement to
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Select
                      value={item.entity_feature_id}
                      onValueChange={(value) =>
                        setItem({
                          ...item,
                          entity_feature_id: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select feature" />
                      </SelectTrigger>
                      <SelectContent>
                        {features
                          .filter(
                            (feature: Feature) =>
                              item.feature_id !== feature.id &&
                              feature.type !== FeatureType.Boolean
                          )
                          .map((feature: Feature) => (
                            <SelectItem
                              key={feature.internal_id}
                              value={feature.id}
                            >
                              <div className="flex gap-2 items-center">
                                per {feature.name}
                                <span className="font-mono text-t3">
                                  {feature.id}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(show.cycle || show.price) && (
                  <SelectCycle
                    showPrice={show.price}
                    setShowCycle={() =>
                      setShow({ ...show, cycle: !show.cycle })
                    }
                    showCycle={show.cycle}
                  />
                )}
              </div>
            )}
          </div>
          {/* {selectedFeature && (
        <UsageResetTooltip
          showCycle={showCycle}
          selectedFeature={selectedFeature}
          showPrice={showPrice}
          priceConfig={priceConfig}
          fields={fields}
        />
      )} */}
        </div>
      </div>
    </div>
  );
};
