import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { notNullish } from "@/utils/genUtils";
import { formatAmount } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachBranch, getAmountForQuantity, Price } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const UpdateQuantity = () => {
  const { org } = useOrg();
  const { attachState, product } = useProductContext();
  const { preview, options, setOptions } = attachState;

  if (preview.branch !== AttachBranch.UpdatePrepaidQuantity) {
    return null;
  }

  const currency = org?.default_currency || "USD";

  const getPrepaidPrice = ({ option }: { option: any }) => {
    if (notNullish(option.price)) {
      return `x ${formatAmount({
        amount: option.price,
        defaultCurrency: currency,
        maxFractionDigits: 5,
      })} per `;
    }

    if (option.tiers) {
      const start = option.tiers[0].amount;
      const end = option.tiers[option.tiers.length - 1].amount;
      return "x ";
      // return `${formatAmount({
      //   amount: start,
      //   defaultCurrency: currency,
      //   maxFractionDigits: 5,
      // })} - ${formatAmount({
      //   amount: end,
      //   defaultCurrency: currency,
      //   maxFractionDigits: 5,
      // })} `;
    }

    return "";
  };

  const getTotalPrice = () => {
    return options.reduce((acc: number, option: any) => {
      const currentQuantity = option.current_quantity || 0;
      const newQuantity = option.quantity || 0;
      const difference = newQuantity - currentQuantity;

      const isDecrease = newQuantity < currentQuantity;

      if (isDecrease && option.config.on_decrease == "none") {
        return acc;
      }

      let priceForDifference = 0;

      // Handle tiered pricing
      if (option.tiers) {
        // Calculate amount for new quantity
        const newAmount = getAmountForQuantity({
          price: {
            config: {
              usage_tiers: option.tiers,
              billing_units: option.billing_units,
            },
          } as Price,
          quantity: newQuantity,
        });

        // Calculate amount for current quantity
        const currentAmount = getAmountForQuantity({
          price: {
            config: {
              usage_tiers: option.tiers,
              billing_units: option.billing_units,
            },
          } as Price,
          quantity: currentQuantity,
        });

        priceForDifference = new Decimal(newAmount)
          .minus(currentAmount)
          .toNumber();
      } else {
        // Handle fixed pricing
        const differenceInUnits = difference / option.billing_units;
        priceForDifference = option.price * differenceInUnits;
      }

      return acc + priceForDifference;
    }, 0);
  };

  return (
    <div className="flex flex-col w-full">
      <p className="text-t2 font-semibold mb-2">Update prepaid quantity</p>
      {/* {preview.due_today &&
        preview.due_today.line_items.map((item: any) => {
          return (
            <PriceItem key={item.description}>
              <span>{item.description}</span>
              <span>{item.price}</span>
            </PriceItem>
          );
        })} */}
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
                  {/* ×{" "} */}
                  {/* {formatAmount({
                    defaultCurrency: currency,
                    amount: price,
                    maxFractionDigits: 2,
                  })}{" "} */}
                  {getPrepaidPrice({ option })}
                  {billing_units === 1 ? " " : billing_units} {feature_name}
                </span>
              </div>
            </PriceItem>
          );
        })}
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
    </div>
  );
};
