import { AttachBranch, Feature, features } from "@autumn/shared";

import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { formatUnixToDate } from "@/utils/formatUtils/formatDateUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { getFeatureInvoiceDescription } from "@autumn/shared";
import { formatAmount } from "@/utils/formatUtils/formatTextUtils";
import { AdjustableOptions } from "./AdjustQuantity";

export const DueNextCycle = () => {
  const { attachState, product, features, org } = useProductContext();
  const preview = attachState.preview;
  const currency = org.default_currency || "USD";

  const getPrepaidPrice = ({ option }: { option: any }) => {
    const quantity = (option.quantity || 0) / option.billing_units;

    return formatAmount({
      amount: option.full_price * quantity,
      currency,
    });
  };

  const branch = attachState.preview?.branch;

  if (!preview.due_next_cycle) return null;

  return (
    <div className="flex flex-col">
      <p className="text-t2 font-semibold mb-2">
        Next cycle: {formatUnixToDate(preview.due_next_cycle.due_at)}
      </p>
      {preview.due_next_cycle.line_items.map((item: any) => {
        const { description, price } = item;
        return (
          <PriceItem key={description}>
            <span>{description}</span>
            <span>{price}</span>
          </PriceItem>
        );
      })}
      {branch == AttachBranch.Downgrade ? (
        <AdjustableOptions />
      ) : (
        <>
          {preview.options.map((option: any) => {
            const quantity = Math.ceil(option.quantity / option.billing_units);
            const description = getFeatureInvoiceDescription({
              feature: features.find(
                (f: Feature) => f.id === option.feature_id,
              )!,
              usage: quantity || 0,
              billingUnits: option.billing_units,
            });

            return (
              <PriceItem key={option.feature_name}>
                <span>
                  {product.name} - {description}
                </span>
                <span>{getPrepaidPrice({ option })}</span>
              </PriceItem>
            );
          })}
        </>
      )}
    </div>
  );
};
