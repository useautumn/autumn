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
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/pro-solid-svg-icons";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { useProductContext } from "../ProductContext";

function CreateFixedPrice({
  config,
  setConfig,
}: {
  config: any;
  setConfig: (config: any) => void;
}) {
  const { org } = useProductContext();

  return (
    <div>
      {/* <p className="text-t3 text-md mt-4 mb-2 font-medium">Rates</p> */}
      <div className="flex flex-col gap-2 mt-4">
        <div className="flex gap-2 items-center">
          <div className="w-6/12">
            <FieldLabel>Amount</FieldLabel>
            <Input
              value={config.amount}
              onChange={(e) => {
                setConfig({ ...config, amount: e.target.value });
              }}
              placeholder="eg. 10.00"
              type="number"
              step="any"
              endContent={
                <span className="text-t3">{org?.default_currency}</span>
              }
            />
          </div>
          <div className="w-6/12">
            <FieldLabel>Interval</FieldLabel>
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
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateFixedPrice;
