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
  handleAddPrice,
}: {
  show: any;
  setShow: (show: any) => void;
  handleAddPrice: () => void;
}) => {
  let { features } = useProductContext();
  let { item, setItem } = useProductItemContext();

  return (
    <div className="flex flex-col gap-6 text-sm w-full">
      {/* 1. Select or create feature */}
      <SelectItemFeature show={show} setShow={setShow} />

      <div className="flex flex-col text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-6">
            <div className="flex gap-4 ">
              <div className="relative w-full h-fit">
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out absolute top-0 left-0 w-full h-full",
                    !show.allowance
                      ? " z-10"
                      : "opacity-0 overflow-hidden z-[-1]"
                  )}
                >
                  <Button
                    variant="dashed"
                    onClick={() =>
                      setShow({ ...show, allowance: !show.allowance })
                    }
                    className="text-sm w-full h-full bg-transparent text-t3"
                  >
                    + Included Usage
                  </Button>
                </div>
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out whitespace-nowrap",
                    show.allowance
                      ? "opacity-100 max-w-full max-h-[200px]"
                      : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden"
                  )}
                >
                  <FieldLabel className="flex items-center gap-2">
                    Included Usage
                    <Tooltip delayDuration={400}>
                      <TooltipTrigger asChild>
                        <InfoIcon className="w-3 h-3 text-t3/50" />
                      </TooltipTrigger>
                      <TooltipContent sideOffset={5} side="top">
                        How much usage of this feature is included as part of
                        this plan
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <div className="flex w-full h-fit gap-2">
                    <Input
                      placeholder="eg. 100"
                      className=""
                      disabled={item.included_usage == "unlimited"}
                      value={item.included_usage}
                      type={
                        item.included_usage === "unlimited" ? "text" : "number"
                      }
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
                    <Button
                      isIcon
                      size="sm"
                      variant="ghost"
                      className="w-fit text-t3"
                      onClick={() => setShow({ ...show, allowance: false })}
                    >
                      <X size={12} className="text-t3" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="relative w-full h-fit">
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out absolute top-0 left-0 w-full h-full",
                    !show.cycle
                      ? "h-full z-10"
                      : "opacity-0 overflow-hidden z-[-1]"
                  )}
                >
                  <Button
                    variant="dashed"
                    onClick={() => setShow({ ...show, cycle: !show.cycle })}
                    className="text-sm w-full h-full bg-transparent text-t3"
                  >
                    + Interval
                  </Button>
                </div>
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out whitespace-nowrap",
                    show.cycle
                      ? "opacity-100 max-w-full max-h-[200px]"
                      : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden"
                  )}
                >
                  <SelectCycle
                    showPrice={show.price}
                    type="reset"
                    setShowCycle={() =>
                      setShow({ ...show, cycle: !show.cycle })
                    }
                    showCycle={show.cycle}
                  />
                </div>
              </div>
            </div>

            <div className="relative w-full">
              <div
                className={cn(
                  "transition-all duration-400 ease-in-out absolute top-0 left-0",
                  !show.price
                    ? "h-[32px] z-10"
                    : "opacity-0 overflow-hidden z-[-1]"
                )}
              >
                <ToggleDisplayButton
                  label="Add Price"
                  show={show.price}
                  onClick={handleAddPrice}
                  className="text-sm"
                >
                  Add Price
                </ToggleDisplayButton>
              </div>
              <div
                className={cn(
                  "transition-all duration-400 ease-in-out whitespace-nowrap",
                  show.price
                    ? "opacity-100 max-w-full max-h-[200px]"
                    : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden"
                )}
              >
                <FieldLabel className="flex items-center gap-2">
                  Pricing
                </FieldLabel>
                <div className="flex flex-col gap-6">
                  <TieredPrice
                    setShowPrice={(val: boolean) =>
                      setShow({ ...show, price: val })
                    }
                  />
                  <SelectCycle
                    showPrice={show.price}
                    type="price"
                    setShowCycle={() =>
                      setShow({ ...show, cycle: !show.cycle })
                    }
                    showCycle={show.cycle}
                  />
                </div>
              </div>
            </div>

            {/* {(show.perEntity || show.cycle || show.price) && ( */}
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
              {/* {(show.cycle || show.price) && ( */}
              {/* )} */}
            </div>
            {/* )} */}
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
