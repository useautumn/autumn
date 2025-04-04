import { Select } from "@/components/ui/select";

import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BillingInterval, EntInterval } from "@autumn/shared";

export const SelectCycle = ({
  fields,
  setFields,
  showPrice,
  priceConfig,
  setPriceConfig,
  setShowCycle,
}: {
  fields: any;
  setFields: (fields: any) => void;
  showPrice: boolean;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
  setShowCycle: (showCycle: boolean) => void;
}) => {
  return (
    <>
      {showPrice ? (
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
      ) : (
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
      )}
    </>
  );
};
