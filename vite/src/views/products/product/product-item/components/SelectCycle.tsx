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
import { BillingInterval, EntInterval, Infinite } from "@autumn/shared";
import { InfoIcon, X } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import { cn } from "@/lib/utils";
import { itemToEntInterval } from "@/utils/product/itemIntervalUtils";

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
        {type == "price" ? "Billing Interval" : "Reset Interval"}
        {type == "reset" && (
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <InfoIcon className="w-3 h-3 text-t3/50" />
            </TooltipTrigger>
            <TooltipContent
              sideOffset={5}
              side="top"
              align="start"
              className="flex flex-col"
            >
              <span className="mb-2">
                How often usage counts reset for this feature:
              </span>
              <div>
                <span className="font-bold">• Periodic reset:</span> for
                consumables like API calls or credits
                <br />
                <span className="font-bold">• No reset:</span> for features with
                ongoing usage like seats or workspaces
                <br />
                <div className="flex items-center gap-1 mt-2 text-amber-600">
                  <InfoIcon size={14} />
                  <span>
                    This isn't a hard rule e.g., consumable credits that don't
                    expire should have{" "}
                    <span className="font-semibold">no reset</span>
                  </span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
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
                  reset_usage_on_billing:
                    value == BillingInterval.OneOff &&
                    item.reset_usage_on_billing
                      ? false
                      : item.reset_usage_on_billing,
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
              disabled={item.included_usage == Infinite}
              value={itemToEntInterval(item) as string}
              onValueChange={(value) => {
                setItem({
                  ...item,
                  interval:
                    value == EntInterval.Lifetime
                      ? show.price
                        ? item.interval
                        : null
                      : (value as EntInterval),
                  reset_usage_on_billing: value != EntInterval.Lifetime,
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
              onClick={() => {
                setShowCycle(false);
                setItem({
                  ...item,
                  reset_usage_on_billing: false,
                });
              }}
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
