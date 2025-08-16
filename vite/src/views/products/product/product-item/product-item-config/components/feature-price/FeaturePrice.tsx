import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { useProductContext } from "../../../../ProductContext";
import { useProductItemContext } from "../../../ProductItemContext";
import {
  Feature,
  FeatureItemSchema,
  Infinite,
  TierInfinite,
} from "@autumn/shared";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { BillingUnits } from "./BillingUnits";
import { UsageTierInput } from "./UsageTierInput";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/useOrg";

export default function FeaturePrice() {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  const feature = features.find((f: Feature) => f.id == item.feature_id);

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

    // Set current last tier
    newTiers[newTiers.length - 1].to =
      newTiers.length > 1 ? newTiers[newTiers.length - 2].to : 0;

    newTiers.push({
      to: TierInfinite,
      amount: 0,
    });
    setItem({ ...item, tiers: newTiers });
  };

  const handlePriceRemoved = () => {
    setItem({
      feature_id: item.feature_id,
      included_usage: item.included_usage || 0,
      interval: item.interval,
      entity_feature_id: item.entity_feature_id,
      reset_usage_when_enabled: item.reset_usage_when_enabled,
      config: item.config,
    });
  };
  const handleRemoveTier = (index: number) => {
    const newTiers = [...item.tiers];

    if (newTiers.length == 1) {
      handlePriceRemoved();
      return;
    }

    newTiers.splice(index, 1);
    newTiers[newTiers.length - 1].to = TierInfinite;
    setItem({ ...item, tiers: newTiers });
  };

  const hasTiers = item.tiers?.length > 1;

  return (
    <div className="flex flex-col w-full">
      <FieldLabel className="flex items-center gap-2">Pricing</FieldLabel>
      <div className="flex flex-col gap-1 max-h-64 overflow-visible">
        {hasTiers ? (
          <MultiTierPrice
            handleAddTier={handleAddTier}
            handleRemoveTier={handleRemoveTier}
            setUsageTier={setUsageTier}
          />
        ) : (
          <SingleTierPrice handleAddTier={handleAddTier} />
        )}
      </div>
    </div>
  );
}

const MultiTierPrice = ({
  handleAddTier,
  handleRemoveTier,
  setUsageTier,
}: {
  handleAddTier: () => void;
  handleRemoveTier: (index: number) => void;
  setUsageTier: (index: number, key: string, value: string | number) => void;
}) => {
  const { item, setItem } = useProductItemContext();
  return (
    <>
      {item.tiers?.map((tier: any, index: number) => (
        <div key={index} className="flex gap-2 w-full items-center">
          <div className="w-full gap-2 flex items-center">
            <div className="flex w-full items-center">
              <div className="flex w-full text-sm items-center gap-2">
                {/* {index == 0 && item.included_usage > 0 && (
                  <span className="text-t3 text-xs pl-1">then</span>
                )} */}
                <UsageTierInput
                  value={
                    index == 0
                      ? item.included_usage || 0
                      : item.tiers[index - 1].to
                  }
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

            <div
              className={cn(
                "flex text-sm",
                item.tiers?.length == 1 ? "w-full" : "w-32"
              )}
            >
              <UsageTierInput
                value={tier.amount}
                onChange={(e) => setUsageTier(index, "amount", e.target.value)}
                type="amount"
              />
            </div>
            <BillingUnits className="max-w-20 min-w-20" disabled={index > 0} />
          </div>
          <div className="flex items-center">
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
        </div>
      ))}
    </>
  );
};

const SingleTierPrice = ({ handleAddTier }: { handleAddTier: () => void }) => {
  const { item, setItem } = useProductItemContext();
  const { org } = useOrg();
  const currency = org?.default_currency.toUpperCase() ?? "USD";

  return (
    <div className="flex gap-2 w-full items-center">
      <div className="flex gap-2 items-center w-full">
        <Input
          value={item.tiers?.[0]?.amount}
          onChange={(e) =>
            setItem({
              ...item,
              tiers: [{ amount: e.target.value, to: Infinite }],
            })
          }
          endContent={
            <span className="text-t3 text-xs mt-0.5">{currency}</span>
          }
        />
        <BillingUnits disabled={false} />
      </div>
      <Button variant="dashed" size="sm" onClick={handleAddTier}>
        Add Tiers
      </Button>
    </div>
  );
};
