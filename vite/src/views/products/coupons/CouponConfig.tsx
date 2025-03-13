import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import {
  Coupon,
  CouponDurationType,
  CreateCoupon,
  DiscountType,
} from "@autumn/shared";
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
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { faCheck, faXmark } from "@fortawesome/pro-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ScrollArea } from "@/components/ui/scroll-area";

export const CouponConfig = ({
  coupon,
  setCoupon,
}: {
  coupon: Coupon;
  setCoupon: (coupon: Coupon) => void;
}) => {
  const { org } = useProductsContext();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel description="Will be shown on receipt">Name</FieldLabel>
          <Input
            value={coupon.name}
            onChange={(e) => setCoupon({ ...coupon, name: e.target.value })}
          />
        </div>
        <div className="w-6/12">
          <FieldLabel description="How users redeem the coupon">
            Promotional Code
          </FieldLabel>
          <Input
            value={coupon.promo_codes[0].code}
            onChange={(e) =>
              setCoupon({
                ...coupon,
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
            value={coupon.discount_type}
            onValueChange={(value) =>
              setCoupon({ ...coupon, discount_type: value as DiscountType })
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
            value={coupon.discount_value}
            onChange={(e) =>
              setCoupon({ ...coupon, discount_value: Number(e.target.value) })
            }
            endContent={
              <p className="text-t3">
                {coupon.discount_type === DiscountType.Percentage
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
            {coupon.duration_type === CouponDurationType.Months && (
              <Input
                className="w-[60px] no-spinner"
                value={coupon.duration_value}
                onChange={(e) => {
                  setCoupon({
                    ...coupon,
                    duration_value: Number(e.target.value),
                  });
                }}
                type="number"
              />
            )}
            <Select
              value={coupon.duration_type}
              onValueChange={(value) =>
                setCoupon({
                  ...coupon,
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
      {coupon.duration_type === CouponDurationType.OneOff && (
        <div className="w-full ml-1 flex items-center gap-2">
          <Checkbox
            checked={coupon.should_rollover}
            onCheckedChange={(checked) =>
              setCoupon({
                ...coupon,
                should_rollover: checked === true,
              })
            }
          />
          <p className="text-sm text-t3">Rollover credits to next invoice</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-t2 mb-2">Products</p>

        <ProductPriceSelector coupon={coupon} setCoupon={setCoupon} />
      </div>
    </div>
  );
};

const ProductPriceSelector = ({
  coupon,
  setCoupon,
}: {
  coupon: Coupon;
  setCoupon: (coupon: Coupon) => void;
}) => {
  const { products, features } = useProductsContext();
  const [open, setOpen] = useState(false);

  // Handle selection/deselection of a price
  const handlePriceToggle = (priceId: string) => {
    let newPriceIds = [...coupon.price_ids];
    if (coupon.price_ids.includes(priceId)) {
      newPriceIds = coupon.price_ids.filter((id) => id !== priceId);
    } else {
      newPriceIds = [...coupon.price_ids, priceId];
    }
    setCoupon({ ...coupon, price_ids: newPriceIds });
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
          {coupon.apply_to_all ? (
            "All Products"
          ) : coupon.price_ids.length == 0 ? (
            "Select Products"
          ) : (
            <>
              {coupon.price_ids.map((priceId) => (
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
                    <FontAwesomeIcon icon={faXmark} size="sm" />
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
                    setCoupon({
                      ...coupon,
                      apply_to_all: !coupon.apply_to_all,
                    });
                  }}
                  className="cursor-pointer"
                >
                  {/* <Checkbox
                    id="apply-to-all"
                    checked={coupon.apply_to_all}
                    onCheckedChange={(checked) =>
                      setCoupon({ ...coupon, apply_to_all: checked === true })
                    }
                    className="text-white"
                  /> */}
                  <p>Apply to all products</p>
                  {coupon.apply_to_all && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="ml-auto"
                      size="sm"
                    />
                  )}
                </CommandItem>
              </CommandGroup>
              {!coupon.apply_to_all &&
                products.map((product: any) => (
                  <CommandGroup key={product.id} heading={product.name}>
                    {product.prices?.map((price: any) => (
                      <CommandItem
                        key={price.id}
                        value={price.id}
                        onSelect={() => handlePriceToggle(price.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">{price.name}</div>
                        {coupon.price_ids.includes(price.id) && (
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="ml-auto"
                            size="sm"
                          />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

//       productName: string;
//       prices: { value: string; label: string }[];
//     }
//   ][]
// ).map(([productId, productData]) => (

// ))} */}
