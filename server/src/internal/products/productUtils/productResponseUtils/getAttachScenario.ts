import { cusProductToProduct } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { AttachScenario, FullCustomer, FullProduct } from "@autumn/shared";
import {
  isFreeProduct,
  isOneOff,
  isProductUpgrade,
} from "../../productUtils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isCanceled } from "@/internal/customers/cusProducts/cusProductUtils/classifyCusProduct.js";

export const getAttachScenario = ({
  fullCus,
  fullProduct,
}: {
  fullCus?: FullCustomer;
  fullProduct: FullProduct;
}) => {
  if (!fullCus) return AttachScenario.New;

  let { curMainProduct, curScheduledProduct } = getExistingCusProducts({
    product: fullProduct,
    cusProducts: fullCus?.customer_products || [],
    internalEntityId: fullCus?.entity?.internal_id,
  });

  if (!curMainProduct || fullProduct.is_add_on) return AttachScenario.New;

  if (isOneOff(fullProduct.prices)) {
    return AttachScenario.New;
  }

  // 1. If current product is the same as the product, return active
  if (curMainProduct?.product.id == fullProduct.id) {
    if (isCanceled({ cusProduct: curMainProduct })) {
      return AttachScenario.Renew;
    } else return AttachScenario.Active;
  }

  if (curScheduledProduct?.product.id == fullProduct.id) {
    return AttachScenario.Scheduled;
  }

  let curFullProduct = cusProductToProduct({ cusProduct: curMainProduct });

  if (
    isFreeProduct(curFullProduct.prices) &&
    isFreeProduct(fullProduct.prices)
  ) {
    return AttachScenario.New;
  }

  let isUpgrade = isProductUpgrade({
    prices1: curFullProduct.prices,
    prices2: fullProduct.prices,
  });

  return isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;
};
