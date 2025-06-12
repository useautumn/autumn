import PerEntityConfig from "./PerEntityConfig";
import TieredPrice from "../TieredPrice";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { SelectItemFeature } from "./SelectItemFeature";
import { cn } from "@/lib/utils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useProductItemContext } from "../ProductItemContext";
import { Button } from "@/components/ui/button";
import { useProductContext } from "../../ProductContext";
import {
  FeatureType,
  FeatureUsageType,
  Infinite,
  ProductItemFeatureType,
} from "@autumn/shared";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { SelectCycle } from "./SelectCycle";
import MoreMenuButton, { MoreMenuPriceButton } from "../MoreMenuButton";

import { getFeature } from "@/utils/product/entitlementUtils";
import { ProrationConfig } from "./ProrationConfig";

export const ConfigWithFeature = ({
  show,
  setShow,
  handleAddPrice,
}: {
  show: any;
  setShow: (show: any) => void;
  handleAddPrice: () => void;
}) => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  const feature = getFeature(item.feature_id, features);
  const featureUsageType = feature?.config?.usage_type;
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
                        : "opacity-0 overflow-hidden z-[-1]",
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
                        : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden",
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
                            : item.included_usage || ""
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
                    </div>
                  </div>
                </div>

                {/* ENTITY CONFIG */}
                <div
                  className={cn(
                    "transition-all duration-400 ease-in-out whitespace-nowrap w-0 max-w-0 opacity-0 z-[-1] overflow-hidden -ml-2",
                    show.perEntity &&
                      "opacity-100 max-w-full w-full max-h-[200px] z-10 ml-0",
                  )}
                >
                  <PerEntityConfig />
                </div>

                {/* INTERVAL CONFIG */}

                {featureUsageType == FeatureUsageType.Single && !show.price && (
                  <div
                    className={cn(
                      "transition-all duration-400 ease-in-out whitespace-nowrap w-full",
                      show.cycle
                        ? "opacity-100 max-w-full max-h-[200px]"
                        : "opacity-0 z-[-1] max-h-7 max-w-0 overflow-hidden",
                    )}
                  >
                    <SelectCycle show={show} setShow={setShow} type="reset" />
                  </div>
                )}
              </div>
              {/* </div> */}

              {/* PRICE CONFIG */}

              <div
                className={cn(
                  "transition-all duration-300 ease-in-out whitespace-nowrap",
                  show.price
                    ? "opacity-100  max-h-[200px]"
                    : "opacity-0 z-[-1] max-h-0 overflow-hidden -mb-6",
                )}
              >
                <div className="flex gap-6 flex-2">
                  <TieredPrice setShow={setShow} show={show} />
                  <div
                    className={cn(
                      "flex items-end gap-2 transition-all duration-300 ease-in-out",
                      item.tiers?.length > 1
                        ? "w-40 min-w-40 flex-1"
                        : "w-full",
                    )}
                  >
                    <SelectCycle show={show} setShow={setShow} type="price" />
                    <MoreMenuPriceButton />
                  </div>
                </div>
              </div>

              <ProrationConfig />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
