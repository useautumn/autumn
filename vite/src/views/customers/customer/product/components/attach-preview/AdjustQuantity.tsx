import {
  PriceItem,
  QuantityInput,
} from "@/components/pricing/attach-pricing-dialog";
import { useOrg } from "@/hooks/common/useOrg";
import { formatAmount } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import React from "react";

export const AdjustableOptions = () => {
  const { org } = useOrg();
  const { attachState, product } = useProductContext();
  const { options, setOptions } = attachState;
  const currency = org.default_currency || "USD";

  if (options.length == 0) return null;

  return (
    <React.Fragment>
      {options.map((option: any, index: number) => {
        const { feature_name, billing_units, quantity, price } = option;
        return (
          <PriceItem key={feature_name}>
            <span>
              {product.name} - {feature_name}
            </span>
            <QuantityInput
              key={feature_name}
              value={quantity ? quantity / billing_units : ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const newOptions = [...options];
                newOptions[index].quantity =
                  parseInt(e.target.value) * billing_units;
                setOptions(newOptions);
              }}
            >
              <span className="text-muted-foreground">
                ×{" "}
                {formatAmount({
                  defaultCurrency: currency,
                  amount: price,
                  maxFractionDigits: 2,
                })}{" "}
                per {billing_units === 1 ? " " : billing_units} {feature_name}
              </span>
            </QuantityInput>
          </PriceItem>
        );
      })}
    </React.Fragment>
  );
};
