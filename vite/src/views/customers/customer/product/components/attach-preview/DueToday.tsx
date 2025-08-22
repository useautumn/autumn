import { QuantityInput } from "@/components/pricing/attach-pricing-dialog";

import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachNewItems } from "./AttachNewItems";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { formatAmount } from "@/utils/product/productItemUtils";
import { AttachBranch } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { Input } from "@/components/ui/input";
import { notNullish } from "@/utils/genUtils";

export const DueToday = () => {
  const { attachState, product, org } = useProductContext();
  const { preview, options, setOptions } = attachState;

  const dueToday = preview.due_today;

  if (!dueToday || preview.branch == AttachBranch.NewVersion) {
    return null;
  }

  const dueTodayItems = dueToday.line_items;
  const currency = org?.default_currency || "USD";
  const branch = preview.branch;

  const getTotalPrice = () => {
    let total =
      preview?.due_today?.line_items.reduce((acc: any, item: any) => {
        if (item.amount) {
          return acc.plus(item.amount);
        }
        return acc;
      }, new Decimal(0)) || new Decimal(0);
    total = total.toNumber();

    options.forEach((option: any) => {
      if (option.price && option.quantity) {
        total = new Decimal(total)
          .plus(
            new Decimal(option.price).times(
              new Decimal(option.quantity).div(option.billing_units)
            )
          )
          .toNumber();
      }
    });
    return total;
  };

  const getTitle = () => {
    if (branch == AttachBranch.UpdatePrepaidQuantity) {
      return "Update quantity";
    }

    return "Due today";
  };

  return (
    <div className="flex flex-col">
      <p className="text-t2 font-semibold mb-2">{getTitle()}</p>
      {dueTodayItems &&
        dueTodayItems.map((item: any) => {
          const { description, price } = item;
          return (
            <PriceItem key={description}>
              <span>{description}</span>
              <span className="max-w-60 overflow-hidden truncate">{price}</span>
            </PriceItem>
          );
        })}
      {/* <AttachNewItems /> */}
      {options.length > 0 &&
        options.map((option: any, index: number) => {
          const { feature_name, billing_units, quantity, price } = option;
          return (
            <PriceItem key={feature_name}>
              <span>
                {product.name} - {feature_name}
              </span>
              <div className="flex items-center gap-2 ">
                <Input
                  type="number"
                  value={notNullish(quantity) ? quantity / billing_units : ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const newOptions = [...options];
                    newOptions[index].quantity =
                      parseInt(e.target.value) * billing_units;

                    setOptions(newOptions);
                  }}
                  className="w-12 h-7"
                />

                <span className="text-muted-foreground truncate max-w-40">
                  ×{" "}
                  {formatAmount({
                    defaultCurrency: currency,
                    amount: price,
                    maxFractionDigits: 2,
                  })}{" "}
                  per {billing_units === 1 ? " " : billing_units} {feature_name}
                </span>
              </div>
            </PriceItem>
          );
        })}
      {preview.due_today && (
        <PriceItem className="font-bold mt-2">
          <span>Total:</span>
          <span>
            {formatAmount({
              amount: getTotalPrice(),
              defaultCurrency: currency,
              maxFractionDigits: 2,
            })}
          </span>
        </PriceItem>
      )}
    </div>
  );
};
