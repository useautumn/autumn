import React from "react";
import { BillingInterval, FixedPriceConfig } from "@autumn/shared";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { useProductContext } from "../ProductContext";
import { SelectCycle } from "../product-item/components/SelectCycle";

function CreateFixedPrice({
  config,
  setConfig,
  show,
  setShow,
}: {
  config: any;
  setConfig: (config: any) => void;
  show: any;
  setShow: (show: any) => void;
}) {
  const { org } = useProductContext();

  return (
    <div>
      {/* <p className="text-t3 text-md mt-4 mb-2 font-medium">Rates</p> */}
      <div className="flex flex-col w-full gap-6 animate-in fade-in duration-300">
        <div className="w-full flex flex-col">
          <FieldLabel>Fixed Price</FieldLabel>
          <div className="flex h-full items-center justify-between gap-2">
            <Input
              value={config.amount}
              onChange={(e) => {
                setConfig({ ...config, amount: e.target.value });
              }}
              placeholder="30.00"
              type="number"
              step="any"
              className="h-full !text-lg min-w-36"
            />
            <span className="text-t2 w-fit px-6 flex justify-center">
              {org?.default_currency.toUpperCase() || "USD"}
            </span>
          </div>
        </div>
        <div className="w-full">
          {/* <FieldLabel>Billing Cycle</FieldLabel>
           <Select
            value={config.interval}
            onValueChange={(val) => {
              setConfig({ ...config, interval: val });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Interval" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BillingInterval).map((interval) => (
                <SelectItem key={interval} value={interval}>
                  {keyToTitle(interval)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select> */}
          <SelectCycle show={show} setShow={setShow} type="price" />
        </div>
      </div>
    </div>
  );
}

export default CreateFixedPrice;
