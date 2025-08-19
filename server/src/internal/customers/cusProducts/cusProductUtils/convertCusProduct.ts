import {
  BillingType,
  CusProductStatus,
  FullCusEntWithFullCusProduct,
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
import { ACTIVE_STATUSES } from "../CusProductService.js";

export const cusProductsToCusPrices = ({
  cusProducts,
  inStatuses,
  billingType,
}: {
  cusProducts: FullCusProduct[];
  inStatuses?: CusProductStatus[];
  billingType?: BillingType;
}) => {
  const cusPrices: FullCustomerPrice[] = [];

  for (const cusProduct of cusProducts) {
    if (inStatuses && !inStatuses.includes(cusProduct.status)) {
      continue;
    }

    let prices = cusProduct.customer_prices;
    if (billingType) {
      prices = prices.filter(
        (cp) => getBillingType(cp.price.config) === billingType
      );
    }

    cusPrices.push(...prices);
  }

  return cusPrices;
};

export const cusProductsToCusEnts = ({
  cusProducts,
  inStatuses = [CusProductStatus.Active],
  reverseOrder = false,
  featureId,
}: {
  cusProducts: FullCusProduct[];
  inStatuses?: CusProductStatus[];
  reverseOrder?: boolean;
  featureId?: string;
}) => {
  let cusEnts: FullCustomerEntitlement[] = [];

  for (const cusProduct of cusProducts) {
    if (!inStatuses.includes(cusProduct.status)) {
      continue;
    }

    cusEnts.push(
      ...cusProduct.customer_entitlements.map((cusEnt) => ({
        ...cusEnt,
        customer_product: cusProduct,
      }))
    );
  }

  if (featureId) {
    cusEnts = cusEnts.filter(
      (cusEnt) => cusEnt.entitlement.feature_id === featureId
    );
  }

  sortCusEntsForDeduction(cusEnts, reverseOrder);

  return cusEnts as FullCusEntWithFullCusProduct[];
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

export const cusProductToSchedule = async ({
  cusProduct,
  stripeCli,
}: {
  cusProduct: FullCusProduct;
  stripeCli: Stripe;
}) => {
  const subScheduleIds = cusProduct?.scheduled_ids || [];
  if (subScheduleIds.length === 0) {
    return null;
  }

  const schedule = await stripeCli.subscriptionSchedules.retrieve(
    subScheduleIds[0],
    {
      expand: ["phases.items.price"],
    }
  );

  if (schedule.status == "canceled") {
    return null;
  }

  return schedule;
};

export const cusProductToSub = async ({
  cusProduct,
  stripeCli,
}: {
  cusProduct?: FullCusProduct;
  stripeCli: Stripe;
}) => {
  const subId = cusProduct?.subscription_ids?.[0];
  if (!subId) {
    return undefined;
  }
  const sub = await stripeCli.subscriptions.retrieve(subId);

  return sub;
};

export const cusProductsToStripeSubs = ({
  cusProducts,
  stripeCli,
}: {
  cusProducts: FullCusProduct[];
  stripeCli: Stripe;
}) => {
  return getStripeSubs({
    stripeCli,
    subIds: cusProducts.flatMap((p: any) => p.subscription_ids || []),
  });
};

export const cusProductToCusEnt = ({
  cusProduct,
  featureId,
}: {
  cusProduct: FullCusProduct;
  featureId: string;
}) => {
  let cusEnts = cusProduct.customer_entitlements;

  let fullCusEnt = cusEnts.find(
    (ce) => ce.entitlement.feature_id === featureId
  );

  if (fullCusEnt) {
    return {
      ...fullCusEnt,
      customer_product: cusProduct,
    } as FullCusEntWithFullCusProduct;
  }

  return undefined;
};
