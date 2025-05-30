import {
  CusProductStatus,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  FullProduct,
} from "@autumn/shared";
import { sortCusEntsForDeduction } from "../cusEnts/cusEntUtils.js";

export const cusProductToCusPrices = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active],
) => {
  const cusPrices: FullCustomerPrice[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusPrices.push(...cusProduct.customer_prices);
  }

  return cusPrices;
};

export const cusProductToCusEnts = (
  cusProducts: FullCusProduct[],
  inStatuses: CusProductStatus[] = [CusProductStatus.Active],
  reverseOrder: boolean = false,
) => {
  const cusEnts: FullCustomerEntitlement[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusEnts.push(
      ...cusProduct.customer_entitlements.map((cusEnt) => ({
        ...cusEnt,
        customer_product: cusProduct,
      })),
    );
  }

  sortCusEntsForDeduction(cusEnts, reverseOrder);

  return cusEnts;
};

export const cusProductToPrices = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  return cusProduct.customer_prices.map((cp) => cp.price);
};

export const cusProductToEnts = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  return cusProduct.customer_entitlements.map((ce) => ce.entitlement);
};

export const cusProductToProduct = (cusProduct: FullCusProduct) => {
  return {
    ...cusProduct.product,
    prices: cusProductToPrices({ cusProduct }),
    entitlements: cusProductToEnts({ cusProduct }),
    free_trial: cusProduct.free_trial,
  } as FullProduct;
};
