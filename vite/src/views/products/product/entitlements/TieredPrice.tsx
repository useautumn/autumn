import { Button } from "@/components/ui/button";
import { UsageTierInput } from "../prices/CreateUsagePrice";
import { cn } from "@/lib/utils";
import { Minus, Pencil, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function TieredPrice({
  config,
  setConfig,
  setShowPrice,
  selectedFeature,
}: //   product,
{
  config: any;
  setConfig: (config: any) => void;
  setShowPrice: (showPrice: boolean) => void;
  selectedFeature: any;
}) {
  const [editBillingUnits, setEditBillingUnits] = useState(false);

  const setUsageTier = (index: number, key: string, value: string | number) => {
    const newUsageTiers = [...config.usage_tiers];
    newUsageTiers[index] = { ...newUsageTiers[index], [key]: value };
    if (key === "to" && newUsageTiers[index + 1]) {
      newUsageTiers[index + 1].from = value; // set value of next tier from to the value of the current tier to
    }
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleAddTier = () => {
    const newUsageTiers = [...config.usage_tiers];
    // First, change the last tier to be 0
    const lastTier = newUsageTiers[newUsageTiers.length - 1];
    if (lastTier.to == -1) {
      newUsageTiers[newUsageTiers.length - 1].to = 0;
    }
    newUsageTiers.push({
      from: Number(lastTier.to),
      to: -1,
      amount: 0.0,
    });
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleRemoveTier = (index: number) => {
    const newUsageTiers = [...config.usage_tiers];

    if (newUsageTiers.length == 1) {
      setShowPrice(false);
      setConfig({
        ...config,
        usage_tiers: [{ from: 0, to: "", amount: 0.0 }],
      }); // If there is only one tier, then set back to allowance input
      return;
    }
    newUsageTiers.splice(index, 1);
    newUsageTiers[newUsageTiers.length - 1].to = -1;
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };
  return (
    <div className="flex flex-col gap-1 max-h-64 overflow-scroll">
      {config.usage_tiers.map((tier: any, index: number) => (
        <div key={index} className="flex gap-1 w-full items-center">
          <div className="w-full gap-2 flex items-center">
            {config.usage_tiers.length > 1 && ( // First tier is just a price and billing units. No from or to tiers.
              <div className="flex w-full items-center">
                <div className="flex w-full text-sm">
                  <UsageTierInput
                    value={tier.from || 0}
                    onChange={(e) =>
                      setUsageTier(index, "from", Number(e.target.value))
                    }
                    type="from"
                    config={config}
                    // entitlements={product.entitlements}
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
                      setUsageTier(index, "to", Number(e.target.value));
                    }}
                    type="to"
                    config={config}
                    // entitlements={product.entitlements}
                  />
                </div>
              </div>
            )}
            <div className="flex w-full gap-2 text-sm items-center">
              <div className="flex w-full">
                <UsageTierInput
                  value={tier.amount}
                  onChange={(e) =>
                    setUsageTier(index, "amount", Number(e.target.value))
                  }
                  type="amount"
                  config={config}
                />
              </div>
              {editBillingUnits && index == 0 ? (
                <>
                  <span className="pr-2 text-t3 text-xs">per</span>
                  <div
                    className="w-full flex items-center relative"
                    onBlur={() => setEditBillingUnits(false)}
                  >
                    <Input
                      autoFocus
                      value={config.billing_units}
                      className="pr-14 !text-xs"
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          billing_units: Number(e.target.value),
                        })
                      }
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px] whitespace-nowrap truncate overflow-hidden max-w-12">
                      {selectedFeature.name}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex w-full">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index > 0}
                    className="w-fit text-t3 w-30 overflow-hidden hover:bg-transparent justify-start"
                    onClick={() => setEditBillingUnits(true)}
                  >
                    <span
                      className={cn(
                        "truncate",
                        index == 0 && "border-b border-dotted border-t3"
                      )}
                    >
                      {config.billing_units == 1
                        ? `per ${selectedFeature.name}`
                        : `per ${config.billing_units} ${selectedFeature.name}`}
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
      {/* <Button
        size="sm"
        variant="outline"
        className="w-fit mt-2"
        onClick={handleAddTier}
      >
        Add Tier
      </Button> */}
    </div>
  );
}
