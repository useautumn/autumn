import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { CusProductStatus } from "@autumn/shared";
import Stripe from "stripe";

export const attachParamsToCurCusProduct = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    attachParamToCusProducts({ attachParams });

  return curSameProduct || curMainProduct;
};

export const attachParamToCusProducts = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    getExistingCusProducts({
      product: attachParams.products[0],
      cusProducts: attachParams.cusProducts!,
      internalEntityId: attachParams.internalEntityId,
    });

  const curCusProduct = curMainProduct || curSameProduct;

  return { curMainProduct, curSameProduct, curScheduledProduct, curCusProduct };
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

export const getSubForAttach = async ({
  subId,
  stripeCli,
}: {
  subId: string;
  stripeCli: Stripe;
}) => {
  const sub = await stripeCli.subscriptions.retrieve(subId, {
    expand: ["items.data.price.tiers"],
  });

  return sub;
};

export const getCustomerSub = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { stripeCli } = attachParams;
  const fullCus = attachParams.customer;
  let cusProducts = fullCus.customer_products;

  const targetGroup = attachParams.products[0].group;
  const targetEntityId = attachParams.internalEntityId || null;
  const targetProductId = attachParams.products[0].id;

  cusProducts.sort((a, b) => {
    // 1. Check same group
    const aGroupMatches = a.product.group === targetGroup;
    const bGroupMatches = b.product.group === targetGroup;

    if (aGroupMatches && !bGroupMatches) return -1;
    if (!aGroupMatches && bGroupMatches) return 1;

    // 2. Check main product
    const aMain = !a.product.is_add_on;
    const bMain = !b.product.is_add_on;

    if (aMain && !bMain) return -1;
    if (!aMain && bMain) return 1;

    // 3. Check same product
    const aProductIdMatches = a.product.id === targetProductId;
    const bProductIdMatches = b.product.id === targetProductId;

    if (aProductIdMatches && !bProductIdMatches) return -1;
    if (!aProductIdMatches && bProductIdMatches) return 1;

    // 4. Check same entity
    const aEntityIdMatches = (a.internal_entity_id || null) === targetEntityId;
    const bEntityIdMatches = (b.internal_entity_id || null) === targetEntityId;

    if (aEntityIdMatches && !bEntityIdMatches) return -1;
    if (!aEntityIdMatches && bEntityIdMatches) return 1;

    return 0;
  });

  const subId = cusProducts.flatMap((cp) => cp.subscription_ids || [])?.[0];

  if (!subId) {
    return undefined;
  }

  const sub = await stripeCli.subscriptions.retrieve(subId, {
    expand: ["items.data.price.tiers"],
  });

  return sub;
};

export const paramsToCurSub = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { stripeCli } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  const subIds = curCusProduct?.subscription_ids || [];
  if (subIds.length === 0) {
    return undefined;
  }

  const sub = await stripeCli.subscriptions.retrieve(subIds[0], {
    expand: ["items.data.price.tiers"],
  });

  return sub;
};

export const paramsToCurSubSchedule = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { stripeCli } = attachParams;
  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  const subScheduleIds = curCusProduct?.scheduled_ids || [];
  if (subScheduleIds.length === 0) {
    return undefined;
  }

  const schedule = await stripeCli.subscriptionSchedules.retrieve(
    subScheduleIds[0],
    {
      expand: ["phases.items.price"],
    }
  );

  if (schedule.status == "canceled") {
    return undefined;
  }

  // const batchPricesGet = [];
  // for (const item of schedule.phases[0].items) {
  //   batchPricesGet.push(stripeCli.prices.retrieve(item.price as string));
  // }
  // const prices = await Promise.all(batchPricesGet);

  return schedule as Stripe.SubscriptionSchedule;
};
