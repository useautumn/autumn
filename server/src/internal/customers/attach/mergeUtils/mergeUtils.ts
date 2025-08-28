import {
  getPriceEntitlement,
  getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";
import {
  isContUsePrice,
  isFixedPrice,
  isPrepaidPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { AttachBranch, Entity, FullCusProduct, Price } from "@autumn/shared";
import Stripe from "stripe";
import { getExistingUsageFromCusProducts } from "../../cusProducts/cusEnts/cusEntUtils.js";
import { cusProductToEnts } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToCurCusProduct,
  getCustomerSub,
} from "../attachUtils/convertAttachParams.js";

export const isMultiProductSub = ({
  sub,
  cusProducts,
}: {
  sub: Stripe.Subscription;
  cusProducts: FullCusProduct[];
}) => {
  const cusProductsOnSub = cusProducts.filter((cp) =>
    cp.subscription_ids?.some((id) => id === sub.id)
  );

  return cusProductsOnSub.length > 1;
};

export const getQuantityToRemove = ({
  cusProduct,
  price,
  entities,
}: {
  cusProduct: FullCusProduct;
  price: Price;
  entities: Entity[];
}) => {
  let finalQuantity = 1;
  const fixedPriceMultiplier = cusProduct.quantity || 1;

  if (isPrepaidPrice({ price })) {
    const options = getPriceOptions(price, cusProduct.options);

    if (!options) return finalQuantity;

    // Remove quantity
    finalQuantity = options.upcoming_quantity || options.quantity || 1;
  }

  if (isContUsePrice({ price })) {
    const ents = cusProductToEnts({ cusProduct });
    const relatedEnt = getPriceEntitlement(price, ents);
    let existingUsage = getExistingUsageFromCusProducts({
      entitlement: relatedEnt,
      cusProducts: [cusProduct],
      entities,
      carryExistingUsages: true,
      internalEntityId: cusProduct.internal_entity_id || undefined,
    });

    finalQuantity = existingUsage || 0;
  }

  if (isFixedPrice({ price })) {
    finalQuantity = fixedPriceMultiplier * (finalQuantity || 1);
  }

  return finalQuantity;
};

export const willMergeSub = async ({
  attachParams,
  branch,
}: {
  attachParams: AttachParams;
  branch: AttachBranch;
}) => {
  const { subId } = await getCustomerSub({ attachParams, onlySubId: true });

  if (branch == AttachBranch.MainIsTrial) {
    return false;
  }

  const cusProducts = attachParams.customer.customer_products;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  // Case where upgrading to free trial...
  if (
    subId &&
    curCusProduct?.subscription_ids?.includes(subId!) &&
    !cusProducts.some(
      (cp) => cp.subscription_ids?.includes(subId!) && cp.id != curCusProduct.id
    ) &&
    attachParams.freeTrial
  ) {
    return false;
  }

  if (subId) return true;

  return false;
};
