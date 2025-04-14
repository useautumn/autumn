import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipContent } from "@/components/ui/tooltip";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { BillingInterval, EntInterval } from "@autumn/shared";
import { InfoIcon, X } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import { cn } from "@/lib/utils";

export const SelectCycle = ({
  show,
  setShow,
  type,
}: {
  show: any;
  setShow: (show: any) => void;
  type: "price" | "reset";
}) => {
  let { item, setItem } = useProductItemContext();

  return (
    <div className={cn("flex flex-col w-full ")}>
      <FieldLabel className="flex items-center gap-2">
        {/* {showPrice && !showCycle && "Billing Cycle"}
          {!showPrice && showCycle && "Usage Reset"}
          {showPrice && showCycle && (
            <div className="flex items-center gap-2 w-fit shrink-0">
              <div className="flex text-t3 text-t3 items-center gap-0 overflow-y-auto">
                Billing
                <div className="flex items-center gap-0 rounded-sm pl-1 h-4.5">
                  <span className="">and reset</span>
                  <Button
                    isIcon
                    size="sm"
                    variant="ghost"
                    className="w-fit text-t3 h-2 max-h-5 max-w-5.5"
                    onClick={() => setShowCycle(false)}
                    dim={4}
                  >
                    <X size={12} />
                  </Button>
                  &nbsp;
                </div>
                Cycle
              </div>
            </div>
          )} */}
        {type == "price" ? "Billing Interval" : "Reset Interval"}
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <InfoIcon className="w-3 h-3 text-t3/50" />
          </TooltipTrigger>
          <TooltipContent sideOffset={5} side="top">
            Frequency at which this feature is reset
          </TooltipContent>
        </Tooltip>
      </FieldLabel>
      {type == "price" ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Select
              value={item.interval ?? BillingInterval.OneOff}
              defaultValue={BillingInterval.Month}
              onValueChange={(value) => {
                setItem({
                  ...item,
                  interval:
                    value == BillingInterval.OneOff
                      ? null
                      : (value as BillingInterval),
                  reset_usage_on_interval:
                    value == BillingInterval.OneOff &&
                    item.reset_usage_on_interval
                      ? false
                      : item.reset_usage_on_interval,
                });
                // value == BillingInterval.OneOff &&
                //   setShow({ ...show, cycle: false });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reset" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BillingInterval).map((interval) => (
                  <SelectItem key={interval} value={interval}>
                    {interval === "semi_annual"
                      ? "per half year"
                      : interval === "one_off"
                      ? "one off"
                      : `per ${interval}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Select
              disabled={item.included_usage == "unlimited"}
              value={
                item.interval && item.reset_usage_on_interval
                  ? item.interval
                  : EntInterval.Lifetime
              }
              onValueChange={(value) => {
                setItem({
                  ...item,
                  interval:
                    value == EntInterval.Lifetime
                      ? show.price
                        ? item.interval
                        : null
                      : (value as EntInterval),
                  reset_usage_on_interval: value != EntInterval.Lifetime,
                });
                // value == EntInterval.Lifetime &&
                //   setShow({ ...show, cycle: false });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reset" />
              </SelectTrigger>
              {!show.price ? (
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
              ) : (
                <SelectContent>
                  <SelectItem value={EntInterval.Lifetime}>no reset</SelectItem>
                  {item.interval && (
                    <SelectItem value={item.interval}>
                      with billing{" "}
                      <span className="text-t3">(per {item.interval})</span>
                    </SelectItem>
                  )}
                </SelectContent>
              )}
            </Select>
            {/* <Button
              isIcon
              size="sm"
              variant="ghost"
              className="w-fit text-t3"
              onClick={() => setShowCycle(false)}
            >
              <X size={12} className="text-t3" />
            </Button> */}
          </div>
        </div>
      )}
    </div>
  );
};

export const UsageResetTooltip = ({
  showCycle,
  selectedFeature,
  showPrice,
  priceConfig,
  fields,
}: {
  showCycle: boolean;
  selectedFeature: any;
  showPrice: boolean;
  priceConfig: any;
  fields: any;
}) => {
  if (fields.interval == EntInterval.Lifetime && !showPrice) {
    return null;
  }

  if (showPrice && priceConfig.interval == BillingInterval.OneOff) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> used
        will not reset.
      </div>
    );
  }

  if (!showPrice && showCycle) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> used
        will reset every{" "}
        {fields.interval == EntInterval.SemiAnnual
          ? "6 months"
          : fields.interval}
        .
      </div>
    );
  }
  if (!showPrice && !showCycle) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> being
        used will not reset.
      </div>
    );
  }

  if (showCycle) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> used
        will be billed for and reset every{" "}
        {priceConfig.interval == EntInterval.SemiAnnual
          ? "6 months"
          : priceConfig.interval}
        .
      </div>
    );
  } else {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> being
        used will carry over every{" "}
        {priceConfig.interval == EntInterval.SemiAnnual
          ? "6 months"
          : priceConfig.interval}
        .
      </div>
    );
  }
};
