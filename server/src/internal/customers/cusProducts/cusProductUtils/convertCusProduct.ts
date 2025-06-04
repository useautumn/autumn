import {
  BillingType,
  CusProductStatus,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  FullProduct,
  Product,
} from "@autumn/shared";
import { sortCusEntsForDeduction } from "../cusEnts/cusEntUtils.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";

export const cusProductsToCusPrices = ({
  cusProducts,
  inStatuses = [CusProductStatus.Active],
}: {
  cusProducts: FullCusProduct[];
  inStatuses?: CusProductStatus[];
}) => {
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
  billingType,
}: {
  cusProduct: FullCusProduct;
  billingType?: BillingType;
}) => {
  let prices = cusProduct.customer_prices.map((cp) => cp.price);

  if (billingType) {
    prices = prices.filter((p) => getBillingType(p.config) === billingType);
  }

  return prices;
};

export const cusProductToEnts = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  return cusProduct.customer_entitlements.map((ce) => ce.entitlement);
};

export const cusProductToProduct = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  return {
    ...cusProduct.product,
    prices: cusProductToPrices({ cusProduct }),
    entitlements: cusProductToEnts({ cusProduct }),
    free_trial: cusProduct.free_trial,
  } as FullProduct;
};

// Subs, schedules
export const cusProductsToSchedules = ({
  cusProducts,
  stripeCli,
}: {
  cusProducts: (FullCusProduct | undefined)[];
  stripeCli: Stripe;
}) => {
  let scheduleIds: string[] = [];
  for (const cusProduct of cusProducts) {
    if (cusProduct) {
      scheduleIds.push(...(cusProduct.scheduled_ids || []));
    }
  }

  return getStripeSchedules({
    stripeCli,
    scheduleIds,
  });
};
