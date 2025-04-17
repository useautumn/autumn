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

import { useProductContext } from "../../ProductContext";
import { Feature, FeatureType, Infinite } from "@autumn/shared";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { SelectCycle } from "./SelectCycle";
import MoreMenuButton, { MoreMenuPriceButton } from "../MoreMenuButton";
import PerEntityConfig from "./PerEntityConfig";
import { getFeature } from "@/utils/product/entitlementUtils";

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
      <div className="flex items-center gap-2 w-full">
        <SelectItemFeature show={show} setShow={setShow} />
        <MoreMenuButton show={show} setShow={setShow} />
      </div>

      {/* if feature type is boolean, dont show anything */}

      {getFeature(item.feature_id, features)?.type !== FeatureType.Boolean && (
        <div className="flex flex-col text-sm">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-6">
              <div className="flex gap-4">
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
                      variant="ghost"
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
                        placeholder="None"
                        className=""
                        disabled={item.included_usage == Infinite}
                        value={
                          item.included_usage == Infinite
                            ? "Unlimited"
                            : item.included_usage
                        }
                        type={
                          item.included_usage === Infinite ? "text" : "number"
                        }
                        onChange={(e) => {
                          setItem({
                            ...item,
                            included_usage: e.target.value,
                          });
                        }}
                      />
                      <ToggleDisplayButton
                        label="Unlimited"
                        show={item.included_usage == Infinite}
                        className="h-8"
                        onClick={() => {
                          setShow({ ...show, price: false });
                          if (itemIsUnlimited(item)) {
                            setItem({
                              ...item,
                              included_usage: "",
                            });
                          } else {
                            setItem({
                              ...item,
                              included_usage: Infinite,
                            });
                          }
                        }}
                      >
                        ♾️
                      </ToggleDisplayButton>
                      {/* <Button
                      isIcon
                      size="sm"
                      variant="ghost"
                      className="w-fit text-t3"
                      onClick={() => setShow({ ...show, allowance: false })}
                    >
                      <X size={12} className="text-t3" />
                    </Button> */}
                    </div>
                  </div>
                </div>

                {/* ENTITY CONFIG */}
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out whitespace-nowrap w-0 max-w-0 opacity-0 z-[-1] overflow-hidden -ml-2",
                    show.perEntity &&
                      "opacity-100 max-w-full w-full max-h-[200px] z-10 ml-0"
                    // : "opacity-0 z-[-1] max-h-7 overflow-hidden"
                  )}
                >
                  <PerEntityConfig />
                </div>

                {/* INTERVAL CONFIG */}
                {/* <div className="relative w-full h-fit ">
                  <div
                    className={cn(
                      "transition-all duration-400 ease-in-out absolute top-0 left-0 w-full h-full",
                      !show.cycle
                        ? "h-full z-10"
                        : "opacity-0 overflow-hidden z-[-1]"
                    )}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => setShow({ ...show, cycle: !show.cycle })}
                      className="text-sm w-full h-full bg-transparent text-t3"
                    >
                      + Interval
                    </Button>
                  </div> */}
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out whitespace-nowrap w-full",
                    show.cycle
                      ? "opacity-100 max-w-full max-h-[200px]"
                      : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden"
                  )}
                >
                  <SelectCycle show={show} setShow={setShow} type="reset" />
                </div>
              </div>
              {/* </div> */}

              {/* PRICE CONFIG */}
              {/* <div className="relative w-full">
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
              </div> */}
              <div
                className={cn(
                  "transition-all duration-300 ease-in-out whitespace-nowrap",
                  show.price
                    ? "opacity-100  max-h-[200px]"
                    : "opacity-0 z-[-1] max-h-0 overflow-hidden -mb-6"
                )}
              >
                <div className="flex gap-6 flex-2">
                  <TieredPrice setShow={setShow} show={show} />
                  <div
                    className={cn(
                      "flex items-end gap-2 transition-all duration-300 ease-in-out",
                      item.tiers?.length > 1 ? "w-40 min-w-40 flex-1" : "w-full"
                    )}
                  >
                    <SelectCycle show={show} setShow={setShow} type="price" />
                    <MoreMenuPriceButton />
                  </div>
                </div>
              </div>
              {/* </div> */}
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
      )}
    </div>
  );
};
