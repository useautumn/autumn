import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Minus, Pencil, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useProductContext } from "../ProductContext";
import { useProductItemContext } from "./ProductItemContext";
import { Feature, TierInfinite } from "@autumn/shared";
import { SelectCycle } from "./components/SelectCycle";
import FieldLabel from "@/components/general/modal-components/FieldLabel";

export default function TieredPrice({
  show,
  setShow,
}: {
  show: any;
  setShow: (show: any) => void;
}) {
  let { features } = useProductContext();
  let { item, setItem } = useProductItemContext();

  let feature = features.find((f: Feature) => f.id == item.feature_id);
  let featureName = feature?.name;

  const [editBillingUnits, setEditBillingUnits] = useState(false);

  const setUsageTier = (index: number, key: string, value: string | number) => {
    const newUsageTiers = [...item.tiers];
    newUsageTiers[index] = { ...newUsageTiers[index], [key]: value };
    if (key === "to" && newUsageTiers[index + 1]) {
      newUsageTiers[index + 1].from = value; // set value of next tier from to the value of the current tier to
    }
    setItem({ ...item, tiers: newUsageTiers });
  };

  const handleAddTier = () => {
    const newTiers = [...item.tiers];
    const lastTier = newTiers[newTiers.length - 1];

    // Set current last tier
    newTiers[newTiers.length - 1].to =
      newTiers.length > 1 ? newTiers[newTiers.length - 2].to : 0;

    newTiers.push({
      to: TierInfinite,
      amount: 0,
    });
    setItem({ ...item, tiers: newTiers });
  };

  const handleRemoveTier = (index: number) => {
    const newTiers = [...item.tiers];
    if (newTiers.length == 1) {
      setShow({ ...show, price: false });
      setItem({
        ...item,
        tiers: null,
        interval: item.reset_usage_on_billing ? item.interval : null,
      });
      return;
    }

    newTiers.splice(index, 1);
    newTiers[newTiers.length - 1].to = TierInfinite;
    setItem({ ...item, tiers: newTiers });
  };

  return (
    <div className="flex flex-col w-full">
      <FieldLabel className="flex items-center gap-2">Pricing</FieldLabel>

      <div className="flex flex-col gap-1 max-h-64 overflow-auto">
        {item.tiers?.map((tier: any, index: number) => (
          <div key={index} className="flex gap-1 w-full items-center">
            <div className="w-full gap-2 flex items-center">
              {index == 0 &&
                item.included_usage > 0 &&
                item.tiers.length == 1 && (
                  <span className="text-t3 text-xs animate-in slide-in-from-left duration-200 pl-1">
                    then
                  </span>
                )}
              {item.tiers?.length > 1 && ( // First tier is just a price and billing units. No from or to tiers.
                <div className="flex w-full items-center">
                  <div className="flex w-full text-sm items-center gap-2">
                    {index == 0 && item.included_usage > 0 && (
                      <span className="text-t3 text-xs pl-1">then</span>
                    )}
                    <UsageTierInput
                      value={index == 0 ? 0 : item.tiers[index - 1].to}
                      onChange={(e) => null}
                      type="from"
                    />
                  </div>
                  <span className="px-2 text-t3 text-xs">to</span>
                  <div
                    className={cn(
                      "flex w-full text-sm",
                      tier.to == -1 && "bg-transparent"
                    )}
                  >
                    <UsageTierInput
                      value={tier.to}
                      onChange={(e) => {
                        setUsageTier(index, "to", e.target.value);
                      }}
                      type="to"
                    />
                  </div>
                </div>
              )}
              <div className="flex w-full gap-2 text-sm items-center">
                <div className="flex w-full">
                  <UsageTierInput
                    value={tier.amount}
                    onChange={(e) =>
                      setUsageTier(index, "amount", e.target.value)
                    }
                    type="amount"
                  />
                </div>
                {editBillingUnits && index == 0 ? (
                  <>
                    <span className="text-t3 text-xs">per</span>
                    <div
                      className="w-full flex items-center relative"
                      onBlur={() => setEditBillingUnits(false)}
                    >
                      <Input
                        autoFocus
                        value={item.billing_units}
                        className="pr-14 !text-xs"
                        type="number"
                        onChange={(e) =>
                          setItem({
                            ...item,
                            billing_units: e.target.value,
                          })
                        }
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px] whitespace-nowrap truncate overflow-hidden max-w-12">
                        {featureName ?? "units"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex w-fit">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index > 0}
                      className="w-fit max-w-24 text-t3 overflow-hidden hover:bg-transparent justify-start"
                      onClick={() => setEditBillingUnits(true)}
                    >
                      <span
                        className={cn(
                          "truncate",
                          index == 0 && "border-b border-dotted border-t3"
                        )}
                      >
                        {item.billing_units == 1
                          ? `per ${featureName ?? "units"}`
                          : `per ${item.billing_units} ${
                              featureName ?? "units"
                            }`}
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Button
              isIcon
              size="sm"
              variant="ghost"
              className="w-fit text-t3"
              onClick={() => handleAddTier()}
              dim={6}
            >
              <Plus size={12} className="text-t3" />
            </Button>
            <Button
              isIcon
              size="sm"
              variant="ghost"
              className="w-fit text-t3 mr-1"
              onClick={() => handleRemoveTier(index)}
              dim={6}
            >
              <X size={12} className="text-t3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export const UsageTierInput = ({
  value,
  onChange,
  type,
}: {
  value: number | string;
  onChange: (e: any) => void;
  type: "from" | "to" | "amount";
}) => {
  if ((type === "to" && value === TierInfinite) || type === "from") {
    //disable inputs for certain tier inputs
    return (
      <Input
        className="outline-none bg-transparent shadow-none flex-grow [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value === TierInfinite ? "♾️" : value}
        disabled
        type="text"
      />
    );
  }

  return (
    <div className="relative w-full flex">
      <Input
        className={cn(
          "outline-none flex w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          type === "amount" && "pr-8"
        )}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
      />
      {type === "amount" && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]">
          USD
        </span>
      )}
    </div>
  );
};
