import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Reward, CouponDurationType, DiscountType } from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const RewardConfig = ({
  reward,
  setReward,
}: {
  reward: Reward;
  setReward: (reward: Reward) => void;
}) => {
  const { org } = useProductsContext();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel description="Will be shown on receipt">Name</FieldLabel>
          <Input
            value={reward.name || ""}
            onChange={(e) => setReward({ ...reward, name: e.target.value })}
          />
        </div>
        <div className="w-6/12">
          <FieldLabel description="How users redeem the coupon">
            Promotional Code
          </FieldLabel>
          <Input
            value={
              reward.promo_codes.length > 0 ? reward.promo_codes[0].code : ""
            }
            onChange={(e) =>
              setReward({
                ...reward,
                promo_codes: [{ code: e.target.value }],
              })
            }
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel>Discount Type</FieldLabel>
          <Select
            value={reward.discount_type}
            onValueChange={(value) =>
              setReward({ ...reward, discount_type: value as DiscountType })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a discount type" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(DiscountType).map((type) => (
                <SelectItem key={type} value={type}>
                  {keyToTitle(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-6/12">
          <FieldLabel>Amount</FieldLabel>
          <Input
            value={reward.discount_value}
            onChange={(e) =>
              setReward({ ...reward, discount_value: Number(e.target.value) })
            }
            endContent={
              <p className="text-t3">
                {reward.discount_type === DiscountType.Percentage
                  ? "%"
                  : org?.currency || "USD"}
              </p>
            }
          />
        </div>
      </div>
      <div>
        <div className="w-6/12">
          <FieldLabel>Duration</FieldLabel>
          <div className="flex items-center gap-1">
            {reward.duration_type === CouponDurationType.Months && (
              <Input
                className="w-[60px] no-spinner"
                value={reward.duration_value}
                onChange={(e) => {
                  setReward({
                    ...reward,
                    duration_value: Number(e.target.value),
                  });
                }}
                type="number"
              />
            )}
            <Select
              value={reward.duration_type}
              onValueChange={(value) =>
                setReward({
                  ...reward,
                  duration_type: value as CouponDurationType,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a duration" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CouponDurationType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {keyToTitle(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {reward.duration_type === CouponDurationType.OneOff && (
        <div className="w-full ml-1 flex items-center gap-2">
          <Checkbox
            checked={reward.should_rollover}
            onCheckedChange={(checked) =>
              setReward({
                ...reward,
                should_rollover: checked === true,
              })
            }
          />
          <p className="text-sm text-t3">Rollover credits to next invoice</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-t2 mb-2">Products</p>

        <ProductPriceSelector reward={reward} setReward={setReward} />
      </div>
    </div>
  );
};

const ProductPriceSelector = ({
  reward,
  setReward,
}: {
  reward: Reward;
  setReward: (reward: Reward) => void;
}) => {
  const { products, features } = useProductsContext();
  const [open, setOpen] = useState(false);

  // Handle selection/deselection of a price
  const handlePriceToggle = (priceId: string) => {
    let newPriceIds = [...reward.price_ids];
    if (reward.price_ids.includes(priceId)) {
      newPriceIds = reward.price_ids.filter((id) => id !== priceId);
    } else {
      newPriceIds = [...reward.price_ids, priceId];
    }
    setReward({ ...reward, price_ids: newPriceIds });
  };

  if (!products || products.length === 0) {
    return <p className="text-sm text-t3">No products available</p>;
  }

  const getPriceText = (priceId: string) => {
    let product: any = null;
    product = products.find((p: any) =>
      p.prices?.find((p: any) => p.id === priceId)
    );
    const price = product?.prices?.find((p: any) => p.id === priceId);

    return `${product?.name} - ${price?.name}`;
  };

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-9 flex flex-wrap h-fit py-2 justify-start items-center gap-2 relative hover:bg-zinc-50"
        >
          {reward.apply_to_all ? (
            "All Products"
          ) : reward.price_ids.length == 0 ? (
            "Select Products"
          ) : (
            <>
              {reward.price_ids.map((priceId) => (
                <div
                  key={priceId}
                  className="py-1 px-3 text-xs text-t3 border-zinc-300 bg-zinc-100 rounded-full w-fit flex items-center gap-2 h-fit"
                >
                  <p>{getPriceText(priceId)}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePriceToggle(priceId);
                    }}
                    className="bg-transparent hover:bg-transparent p-0 w-5 h-5"
                  >
                    <X size={12} className="text-t3" />
                  </Button>
                </div>
              ))}
            </>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 absolute right-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search prices..." className="h-9" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <ScrollArea>
              <CommandEmpty>No prices found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setReward({
                      ...reward,
                      apply_to_all: !reward.apply_to_all,
                    });
                  }}
                  className="cursor-pointer"
                >
                  <p>Apply to all products</p>
                  {reward.apply_to_all && (
                    <Check size={12} className="text-t3" />
                  )}
                </CommandItem>
              </CommandGroup>
              {!reward.apply_to_all &&
                products.map((product: any) => (
                  <CommandGroup key={product.id} heading={product.name}>
                    {product.prices.length > 0 ? (
                      product.prices?.map((price: any) => (
                        <CommandItem
                          key={price.id}
                          value={price.id}
                          onSelect={() => handlePriceToggle(price.id)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center">{price.name}</div>
                          {reward.price_ids.includes(price.id) && (
                            <Check size={12} className="text-t3" />
                          )}
                        </CommandItem>
                      ))
                    ) : (
                      <CommandItem disabled>
                        <p className="text-sm text-t3">No prices available</p>
                      </CommandItem>
                    )}
                  </CommandGroup>
                ))}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
