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

export const SelectCycle = ({
  fields,
  setFields,
  showPrice,
  priceConfig,
  setPriceConfig,
  setShowCycle,
  showCycle,
}: {
  fields: any;
  setFields: (fields: any) => void;
  showPrice: boolean;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
  setShowCycle: (showCycle: boolean) => void;
  showCycle: boolean;
}) => {
  return (
    <div className="flex flex-col w-full">
      <FieldLabel className="flex justify-between items-center max-h-4">
        <div className="flex items-center gap-2">
          {showPrice && !showCycle && "Billing Cycle"}
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
          )}
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <InfoIcon className="w-3 h-3 text-t3/50" />
            </TooltipTrigger>
            <TooltipContent sideOffset={5} side="top">
              Frequency at which this feature is reset
            </TooltipContent>
          </Tooltip>
        </div>
      </FieldLabel>
      {showPrice ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Select
              value={priceConfig.interval}
              defaultValue={BillingInterval.Month}
              onValueChange={(value) => {
                setPriceConfig({
                  ...priceConfig,
                  interval: value as BillingInterval,
                });
                value == BillingInterval.OneOff && setShowCycle(false);
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
              value={fields.interval}
              onValueChange={(value) => {
                setFields({
                  ...fields,
                  interval: value as EntInterval,
                });
                value == EntInterval.Lifetime && setShowCycle(false);
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
                      ? "never"
                      : `per ${interval}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              isIcon
              size="sm"
              variant="ghost"
              className="w-fit text-t3"
              onClick={() => setShowCycle(false)}
            >
              <X size={12} className="text-t3" />
            </Button>
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
