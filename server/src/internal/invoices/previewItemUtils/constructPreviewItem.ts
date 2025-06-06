import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { formatAmount } from "@/utils/formatUtils.js";
import { Organization, Price } from "@autumn/shared";

export const constructPreviewItem = ({
  priceStr,
  price,
  org,
  amount,
  description,
}: {
  priceStr?: string;
  price: Price;
  org: Organization;
  amount?: number;
  description: string;
}) => {
  if (amount) {
    priceStr = formatAmount({
      org,
      amount,
    });
  } else {
    priceStr = priceStr;
  }

  return {
    price: priceStr!,
    description,
    amount,
    usage_model: priceToUsageModel(price),
    price_id: price.id!,
  };
};
