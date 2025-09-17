import { cusProductToPrices, cusProductToEnts } from "@autumn/shared";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { isMainProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { notNullish } from "@/utils/genUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  FullCustomer,
  FullProduct,
  Price,
  Entitlement,
  CreateFreeTrial,
} from "@autumn/shared";
import { AttachBody } from "@autumn/shared";
import { mapOptionsList } from "../../mapOptionsList.js";

export const getPricesAndEnts = async ({
  req,
  attachBody,
  customer,
  products,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  customer: FullCustomer;
  products: FullProduct[];
}) => {
  const { options: optionsInput, is_custom, items, free_trial } = attachBody;
  const { features, db, org, logtail: logger } = req;

  const { curMainProduct, curSameProduct } = getExistingCusProducts({
    product: products[0],
    cusProducts: customer.customer_products,
    internalEntityId: customer.entity?.internal_id,
  });

  // Not custom
  if (!is_custom) {
    let prices = products.flatMap((p: FullProduct) => p.prices);
    let entitlements = products.flatMap((p: FullProduct) => p.entitlements);

    let freeTrial = null;
    let freeTrialProduct = products.find((p) => notNullish(p.free_trial));

    if (freeTrialProduct) {
      freeTrial = await getFreeTrialAfterFingerprint({
        db,
        freeTrial: freeTrialProduct.free_trial,
        fingerprint: customer.fingerprint,
        internalCustomerId: customer.internal_id,
        multipleAllowed: org.config.multiple_trials,
        productId: freeTrialProduct.id,
      });
    }

    return {
      optionsList: mapOptionsList({
        optionsInput: optionsInput || [],
        features,
        prices,
        curCusProduct: curMainProduct,
      }),
      prices,
      entitlements,
      freeTrial,
      cusProducts: customer.customer_products,
    };
  }

  const product = products[0];

  let curPrices: Price[] = product!.prices;
  let curEnts: Entitlement[] = product!.entitlements;

  if (curMainProduct?.product.id === product.id) {
    curPrices = cusProductToPrices({ cusProduct: curMainProduct });
    curEnts = cusProductToEnts({ cusProduct: curMainProduct });
  }

  let {
    prices,
    entitlements: ents,
    customPrices,
    customEnts,
  } = await handleNewProductItems({
    db,
    curPrices,
    curEnts,
    newItems: attachBody.items || [],
    features,
    product,
    logger,
    isCustom: true,
  });

  const freeTrial = await handleNewFreeTrial({
    db,
    curFreeTrial: product!.free_trial,
    newFreeTrial: (free_trial as CreateFreeTrial) || null,
    internalProductId: product!.internal_id,
    isCustom: true,
  });

  const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
    db,
    freeTrial: freeTrial,
    fingerprint: customer.fingerprint,
    internalCustomerId: customer.internal_id,
    multipleAllowed: org.config.multiple_trials,
    productId: product.id,
  });

  return {
    optionsList: mapOptionsList({
      optionsInput: optionsInput || [],
      features,
      prices,
      curCusProduct: curMainProduct,
    }),
    prices,
    entitlements: getEntsWithFeature({
      ents,
      features,
    }),
    freeTrial: uniqueFreeTrial,
    customPrices,
    customEnts,
  };
};
