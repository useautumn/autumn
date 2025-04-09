import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { RewardTrigger, Coupon, RewardTriggerEvent } from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, X } from "lucide-react";

export const RewardTriggerConfig = ({
  rewardTrigger,
  setRewardTrigger,
}: {
  rewardTrigger: RewardTrigger;
  setRewardTrigger: (rewardTrigger: RewardTrigger) => void;
}) => {
  let { coupons } = useProductsContext();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel>ID</FieldLabel>
          <Input
            value={rewardTrigger.id || ""}
            onChange={(e) =>
              setRewardTrigger({ ...rewardTrigger, id: e.target.value })
            }
          />
        </div>
        <div className="w-6/12">
          <FieldLabel>Coupon</FieldLabel>
          <Select
            value={rewardTrigger.internal_reward_id}
            onValueChange={(value) =>
              setRewardTrigger({ ...rewardTrigger, internal_reward_id: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a coupon" />
            </SelectTrigger>
            <SelectContent>
              {coupons.map((coupon: Coupon) => (
                <SelectItem key={coupon.name} value={coupon.internal_id}>
                  {coupon.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel>Redeem On</FieldLabel>
          <Select
            defaultValue={RewardTriggerEvent.Immediately}
            value={rewardTrigger.when}
            onValueChange={(value) =>
              setRewardTrigger({
                ...rewardTrigger,
                when: value as RewardTriggerEvent,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a redeem on" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RewardTriggerEvent).map((event) => (
                <SelectItem key={event} value={event}>
                  {keyToTitle(event)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-6/12">
          <FieldLabel>Max Redemptions</FieldLabel>
          <Input
            type="number"
            value={rewardTrigger.max_redemptions}
            onChange={(e) =>
              setRewardTrigger({
                ...rewardTrigger,
                max_redemptions: parseInt(e.target.value),
              })
            }
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {rewardTrigger.when === RewardTriggerEvent.Checkout && (
          <div className="w-full">
            <FieldLabel>Products</FieldLabel>
            <ProductSelector
              rewardTrigger={rewardTrigger}
              setRewardTrigger={setRewardTrigger}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const ProductSelector = ({
  rewardTrigger,
  setRewardTrigger,
}: {
  rewardTrigger: RewardTrigger;
  setRewardTrigger: (rewardTrigger: RewardTrigger) => void;
}) => {
  const { products } = useProductsContext();
  const [open, setOpen] = useState(false);

  // Handle selection/deselection of a product
  const handleProductToggle = (productId: string) => {
    let newProductIds = [...(rewardTrigger.product_ids || [])];
    if (newProductIds.includes(productId)) {
      newProductIds = newProductIds.filter((id) => id !== productId);
    } else {
      newProductIds = [...newProductIds, productId];
    }
    setRewardTrigger({
      ...rewardTrigger,
      product_ids: newProductIds,
    });
  };

  if (!products || products.length === 0) {
    return <p className="text-sm text-t3">No products available</p>;
  }

  const getProductText = (productId: string) => {
    const product = products.find((p: any) => p.id === productId);
    return product?.name || "Unknown Product";
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
          {rewardTrigger.product_ids?.length === 0 ? (
            "Select Products"
          ) : (
            <>
              {rewardTrigger.product_ids?.map((productId) => (
                <div
                  key={productId}
                  className="py-0 px-3 text-xs text-t3 border-zinc-300 bg-zinc-100 rounded-full w-fit flex items-center gap-2 h-fit"
                >
                  <p className="text-t2">{getProductText(productId)}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProductToggle(productId);
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
          <CommandInput placeholder="Search products..." className="h-9" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <ScrollArea>
              <CommandEmpty>No products found.</CommandEmpty>
              <CommandGroup>
                {products.map((product: any) => (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={() => handleProductToggle(product.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center">{product.name}</div>
                    {rewardTrigger.product_ids?.includes(product.id) && (
                      <Check size={12} className="text-t3" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
