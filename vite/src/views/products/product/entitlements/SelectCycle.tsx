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
  selectedFeature,
}: {
  fields: any;
  setFields: (fields: any) => void;
  showPrice: boolean;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
  setShowCycle: (showCycle: boolean) => void;
  showCycle: boolean;
  selectedFeature: any;
}) => {
  return (
    <div className="flex flex-col w-full">
      <FieldLabel className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {showPrice ? "Billing Cycle" : "Usage Reset Cycle"}
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
            {showPrice && showCycle && (
              <div className="flex items-center gap-2 w-fit shrink-0">
                <div className="flex text-t2 rounded-sm text-t3 h-8 items-center pl-2 gap-2">
                  <span className="text-xs">+ usage reset</span>
                  <Button
                    isIcon
                    size="sm"
                    variant="ghost"
                    className="w-fit text-t3 h-2 max-h-5 max-w-5.5 mr-1"
                    onClick={() => setShowCycle(false)}
                    dim={6}
                  >
                    <X size={12} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <UsageResetTooltip
            showCycle={showCycle}
            selectedFeature={selectedFeature}
            showPrice={showPrice}
            priceConfig={priceConfig}
            fields={fields}
          />
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
          <UsageResetTooltip
            showCycle={showCycle}
            selectedFeature={selectedFeature}
            showPrice={showPrice}
            priceConfig={priceConfig}
            fields={fields}
          />
        </div>
      )}
    </div>
  );
};

const UsageResetTooltip = ({
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

  if (!showPrice) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> used
        will reset to 0 every{" "}
        {fields.interval == EntInterval.SemiAnnual
          ? "6 months"
          : fields.interval}
        .
      </div>
    );
  }

  if (showCycle) {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> used
        will reset to 0 every billing cycle.
      </div>
    );
  } else {
    return (
      <div className="text-t3 text-xs">
        Number of <span className="font-mono">{selectedFeature.id}</span> being
        used will carry over each billing cycle.
      </div>
    );
  }
};
