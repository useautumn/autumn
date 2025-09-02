import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  isArrearPrice,
  isContUsePrice,
  isUsagePrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import RecaseError from "@/utils/errorUtils.js";
import { AttachBody, AttachBranch, Price } from "@autumn/shared";

export const handleMultiAttachErrors = async ({
  attachParams,
  attachBody,
  branch,
}: {
  attachParams: AttachParams;
  attachBody: AttachBody;
  branch: AttachBranch;
}) => {
  const { products, prices } = attachParams;

  const usagePrice = prices.find((p: Price) => isUsagePrice({ price: p }));

  // 1. Don't support usage prices just yet...
  if (usagePrice) {
    const product = products.find(
      (p) => p.internal_id === usagePrice.internal_product_id
    );
    throw new RecaseError({
      code: "invalid_inputs",
      message: `The 'products' parameter doesn't support prices that are variable (usage-based) at the moment. The product ${product?.name} contains this.`,
    });
  }

  // 2. What if there are scheduled products...? (just replace?)
  if (branch == AttachBranch.MultiAttach) {
    // const scheduledProducts = products.filter(
    //   (p) => p.status == CusProductStatus.Scheduled
    // );
  }

  // 3.
};
