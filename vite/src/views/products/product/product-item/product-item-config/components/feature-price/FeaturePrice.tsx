import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { useProductContext } from "../../../../ProductContext";
import { useProductItemContext } from "../../../ProductItemContext";
import { Feature, FeatureItemSchema, TierInfinite } from "@autumn/shared";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { BillingUnits } from "./BillingUnits";
import { UsageTierInput } from "./UsageTierInput";

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
    setItem(
      FeatureItemSchema.parse({
        ...item,
        included_usage: item.included_usage || 0,
      }),
    );
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

  return (
    <div className="flex flex-col w-full">
      <FieldLabel className="flex items-center gap-2">Pricing</FieldLabel>
      <div className="flex flex-col gap-1 max-h-64 overflow-visible">
        {item.tiers?.map((tier: any, index: number) => (
          <div key={index} className="flex gap-2 w-full items-center">
            <div className="w-full gap-2 flex items-center">
              {index == 0 &&
                item.tiers?.length == 1 &&
                item.included_usage > 0 && (
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
                      tier.to == -1 && "bg-transparent",
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
              <div
                className={cn(
                  "flex text-sm",
                  item.tiers?.length == 1 ? "w-full" : "w-32",
                )}
              >
                <UsageTierInput
                  value={tier.amount}
                  onChange={(e) =>
                    setUsageTier(index, "amount", e.target.value)
                  }
                  type="amount"
                />
              </div>
            </div>
            <div className="flex items-center min-w-40 max-w-40">
              <BillingUnits disabled={index > 0} />
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
      </div>
    </div>
  );
}

// export const UsageTierInput = ({
//   value,
//   onChange,
//   type,
// }: {
//   value: number | string;
//   onChange: (e: any) => void;
//   type: "from" | "to" | "amount";
// }) => {
//   if ((type === "to" && value === TierInfinite) || type === "from") {
//     //disable inputs for certain tier inputs
//     return (
//       <Input
//         className="outline-none bg-transparent shadow-none flex-grow [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
//         value={value === TierInfinite ? "♾️" : value}
//         disabled
//         type="text"
//       />
//     );
//   }

//   return (
//     <div className="relative w-full flex">
//       <Input
//         className={cn(
//           "outline-none flex w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
//           type === "amount" && "pr-8",
//         )}
//         value={value}
//         onChange={onChange}
//         type="number"
//         step="any"
//       />
//       {type === "amount" && (
//         <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]">
//           USD
//         </span>
//       )}
//     </div>
//   );
// };
