import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";

export const attachParamToCusProducts = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    getExistingCusProducts({
      product: attachParams.products[0],
      cusProducts: attachParams.cusProducts!,
    });

  return { curMainProduct, curSameProduct, curScheduledProduct };
};

export const attachParamsToProduct = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { org, features, prices, entitlements, freeTrial } = attachParams;
  const product = attachParams.products[0];

  return {
    ...product,
    prices,
    entitlements,
    free_trial: freeTrial,
  };
};
