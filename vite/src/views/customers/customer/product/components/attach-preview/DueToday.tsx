import { useEffect, useState } from "react";
import { QuantityInput } from "@/components/pricing/attach-pricing-dialog";

import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachNewItems } from "./AttachNewItems";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { formatAmount } from "@/utils/product/productItemUtils";
import {
  AttachBranch,
  getAmountForQuantity,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { Input } from "@/components/ui/input";
import { notNullish } from "@/utils/genUtils";
import { useOrg } from "@/hooks/common/useOrg";
import { useCusQuery } from "../../../hooks/useCusQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { CusService } from "@/services/customers/CusService";

export const DueToday = () => {
  const { org } = useOrg();
  const { attachState, product } = useProductContext();
  const { customer, entities } = useCusQuery();
  const [discount, setDiscount] = useState<any>(null);

  console.log("DueToday render - customer:", customer);

  const { preview, options, setOptions } = attachState;

  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  useEffect(() => {
    if (!customer?.internal_id) return;

    const fetchCoupon = async () => {
      try {
        const data = await CusService.getCustomerCoupon({
          axiosInstance,
          customer_id: customer.internal_id,
        });
        console.log("Coupon for customer:", customer.internal_id, data);

        // Save discount in state if available
        setDiscount(data?.coupon?.discount?.coupon || null);
      } catch (err) {
        console.error("Error fetching coupon:", err);
      }
    };

    fetchCoupon();
  }, []);

  const dueToday = preview.due_today;

  if (!dueToday || preview.branch == AttachBranch.NewVersion) {
    return null;
  }

  const calculateDiscount = (total: number) => {
    if (!discount) return 0;

    if (discount.percent_off) {
      return (total * discount.percent_off) / 100;
    }

    if (discount.amount_off) {
      return discount.amount_off; // already in cents/minor units
    }

    return 0;
  };

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
      if (option.tiers) {
        const amount = getAmountForQuantity({
          price: {
            config: {
              usage_tiers: option.tiers,
              billing_units: option.billing_units,
            },
          } as Price,
          quantity: option.quantity || 0,
        });

        total = new Decimal(total).plus(amount).toNumber();
      }

      if (notNullish(option.price)) {
        total = new Decimal(total)
          .plus(
            new Decimal(option.price).times(
              new Decimal(option.quantity || 0).div(option.billing_units)
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

  const getPrepaidPrice = ({ option }: { option: any }) => {
    if (notNullish(option.price)) {
      return `x ${formatAmount({
        amount: option.price,
        defaultCurrency: currency,
        maxFractionDigits: 5,
      })} per `;
    }

    if (option.tiers) {
      return "x ";
    }

    return "";
  };

  const totalBeforeDiscount = getTotalPrice();
  const discountAmount = calculateDiscount(totalBeforeDiscount);
  const finalTotal = totalBeforeDiscount - discountAmount;

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
      {options.length > 0 &&
        options.map((option: any, index: number) => {
          const { feature_name, billing_units, quantity, price } = option;
          return (
            <PriceItem key={feature_name}>
              <span className="max-w-60 overflow-hidden truncate">
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
                  {getPrepaidPrice({ option })}
                  {billing_units === 1 ? " " : billing_units} {feature_name}
                </span>
              </div>
            </PriceItem>
          );
        })}
      {preview.due_today && (
        <>
          {discount && (
            <PriceItem className="text-green-600">
              <span>Discount ({discount.name}):</span>
              <span>
                -{" "}
                {discount.percent_off
                  ? `${discount.percent_off}% (${formatAmount({
                      amount: discountAmount,
                      defaultCurrency: currency,
                      maxFractionDigits: 2,
                    })})`
                  : formatAmount({
                      amount: discountAmount,
                      defaultCurrency: currency,
                      maxFractionDigits: 2,
                    })}
              </span>
            </PriceItem>
          )}

          <PriceItem className="font-bold mt-2">
            <span>Final Total:</span>
            <span>
              {formatAmount({
                amount: finalTotal,
                defaultCurrency: currency,
                maxFractionDigits: 2,
              })}
            </span>
          </PriceItem>
        </>
      )}
    </div>
  );
};
